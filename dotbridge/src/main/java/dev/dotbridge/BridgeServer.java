package dev.dotbridge;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonNull;
import com.google.gson.JsonObject;
import com.google.gson.JsonPrimitive;
import com.google.gson.stream.JsonReader;
import com.google.gson.stream.JsonToken;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.io.StringReader;
import java.math.BigDecimal;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.URLDecoder;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.ScheduledThreadPoolExecutor;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicInteger;

/** A small authenticated loopback HTTP transport. It never reads Minecraft objects. */
public final class BridgeServer implements AutoCloseable {
    private static final int MAX_BODY_BYTES = 8192;
    private static final long BACKEND_TIMEOUT_MS = 2000;
    private static final Gson GSON = new GsonBuilder().serializeNulls().create();
    private final HttpServer server;
    private final ThreadPoolExecutor executor;
    private final ScheduledThreadPoolExecutor deadlines;
    private final byte[] token;
    private final Backend backend;

    public interface Backend {
        /** Return a published snapshot, without waiting on the game thread. */
        JsonObject state();
        CompletableFuture<JsonObject> observe(int radius);
        CompletableFuture<JsonObject> action(JsonObject body);
    }

    public static final class ApiException extends RuntimeException {
        private final int status;

        public ApiException(int status, String message) {
            super(message);
            if (status < 400 || status > 599) throw new IllegalArgumentException("Invalid error status");
            this.status = status;
        }

        public int status() {
            return status;
        }
    }

    public BridgeServer(int port, String token, Backend backend) throws IOException {
        if (port < 0 || port > 65535) throw new IllegalArgumentException("Invalid port");
        if (token == null || token.isBlank()) throw new IllegalArgumentException("A token is required");
        this.token = token.getBytes(StandardCharsets.UTF_8);
        this.backend = Objects.requireNonNull(backend);
        server = HttpServer.create(new InetSocketAddress(InetAddress.getByName("127.0.0.1"), port), 16);
        executor = new ThreadPoolExecutor(4, 4, 0, TimeUnit.MILLISECONDS,
                new ArrayBlockingQueue<>(16), daemonThreads("dotbridge-http-"),
                new ThreadPoolExecutor.AbortPolicy());
        deadlines = new ScheduledThreadPoolExecutor(1, daemonThreads("dotbridge-deadline-"));
        deadlines.setRemoveOnCancelPolicy(true);
        server.setExecutor(executor);
        server.createContext("/", this::handle);
    }

    public void start() {
        server.start();
    }

    public int getPort() {
        return server.getAddress().getPort();
    }

    @Override
    public void close() {
        server.stop(0);
        executor.shutdownNow();
        deadlines.shutdownNow();
    }

    private static ThreadFactory daemonThreads(String prefix) {
        AtomicInteger index = new AtomicInteger();
        return task -> {
            Thread thread = new Thread(task, prefix + index.incrementAndGet());
            thread.setDaemon(true);
            return thread;
        };
    }

    private void handle(HttpExchange exchange) {
        ScheduledFuture<?> deadline = deadlines.schedule(exchange::close, 4, TimeUnit.SECONDS);
        try {
            validateLocalRequest(exchange);
            String path = exchange.getRequestURI().getRawPath();
            switch (path) {
                case "/health" -> {
                    requireMethod(exchange, "GET");
                    requireNoQuery(exchange);
                    JsonObject health = new JsonObject();
                    health.addProperty("ok", true);
                    health.addProperty("mod", "dotbridge");
                    health.addProperty("version", "1.0.0");
                    health.addProperty("minecraft", "1.21.1");
                    health.addProperty("loader", "neoforge");
                    respond(exchange, 200, health);
                }
                case "/v1/state" -> {
                    requireAuth(exchange);
                    requireMethod(exchange, "GET");
                    requireNoQuery(exchange);
                    respond(exchange, 200, backend.state());
                }
                case "/v1/observe" -> {
                    requireAuth(exchange);
                    requireMethod(exchange, "GET");
                    respond(exchange, 200, await(backend.observe(parseRadius(exchange))));
                }
                case "/v1/action" -> {
                    requireAuth(exchange);
                    requireMethod(exchange, "POST");
                    requireNoQuery(exchange);
                    JsonObject body = readJsonBody(exchange);
                    respond(exchange, 202, await(backend.action(body)));
                }
                default -> throw new ApiException(404, "Unknown endpoint");
            }
        } catch (ApiException error) {
            if (error.status() == 401) exchange.getResponseHeaders().set("WWW-Authenticate", "Bearer");
            respondError(exchange, error.status(), error.getMessage());
        } catch (Exception error) {
            respondError(exchange, 500, "Internal bridge error");
        } finally {
            deadline.cancel(false);
            exchange.close();
        }
    }

    private void validateLocalRequest(HttpExchange exchange) {
        if (!exchange.getRemoteAddress().getAddress().isLoopbackAddress()) {
            throw new ApiException(403, "Loopback connections only");
        }
        // Browser origins are deliberately unsupported. The token must be used by
        // a local tool, and must never become a credential for an arbitrary website.
        if (exchange.getRequestHeaders().containsKey("Origin")) {
            throw new ApiException(403, "Browser origins are not allowed");
        }
        List<String> hosts = exchange.getRequestHeaders().get("Host");
        if (hosts == null || hosts.size() != 1) throw new ApiException(403, "Invalid Host header");
        String host = hosts.getFirst().toLowerCase(Locale.ROOT);
        String port = ":" + getPort();
        boolean valid = host.equals("127.0.0.1" + port) || host.equals("localhost" + port)
                || host.equals("[::1]" + port);
        if (getPort() == 80) valid |= host.equals("127.0.0.1") || host.equals("localhost") || host.equals("[::1]");
        if (!valid) throw new ApiException(403, "Invalid Host header");
    }

    private void requireAuth(HttpExchange exchange) {
        List<String> auth = exchange.getRequestHeaders().get("Authorization");
        String value = auth != null && auth.size() == 1 ? auth.getFirst() : "";
        if (value.length() < 7 || !value.regionMatches(true, 0, "Bearer ", 0, 7)
                || !MessageDigest.isEqual(token, value.substring(7).getBytes(StandardCharsets.UTF_8))) {
            throw new ApiException(401, "Invalid or missing token");
        }
    }

    private static void requireMethod(HttpExchange exchange, String method) {
        if (!exchange.getRequestMethod().equals(method)) {
            exchange.getResponseHeaders().set("Allow", method);
            throw new ApiException(405, "Method not allowed");
        }
    }

    private static void requireNoQuery(HttpExchange exchange) {
        if (exchange.getRequestURI().getRawQuery() != null) {
            throw new ApiException(400, "This endpoint does not accept query parameters");
        }
    }

    private static int parseRadius(HttpExchange exchange) {
        String query = exchange.getRequestURI().getRawQuery();
        if (query == null || query.isEmpty()) return 4;
        String[] parts = query.split("&", -1);
        if (parts.length != 1) throw new ApiException(400, "Use one radius parameter from 1 to 8");
        String[] pair = parts[0].split("=", -1);
        try {
            if (pair.length != 2 || !URLDecoder.decode(pair[0], StandardCharsets.UTF_8).equals("radius")) {
                throw new ApiException(400, "Unknown query parameter");
            }
            String raw = URLDecoder.decode(pair[1], StandardCharsets.UTF_8);
            if (!raw.matches("[1-8]")) throw new ApiException(400, "Radius must be an integer from 1 to 8");
            return Integer.parseInt(raw);
        } catch (IllegalArgumentException error) {
            throw new ApiException(400, "Invalid radius parameter");
        }
    }

    private static JsonObject readJsonBody(HttpExchange exchange) throws IOException {
        String contentType = exchange.getRequestHeaders().getFirst("Content-Type");
        if (contentType == null || !contentType.split(";", 2)[0].strip().equalsIgnoreCase("application/json")) {
            throw new ApiException(415, "Content-Type must be application/json");
        }
        String length = exchange.getRequestHeaders().getFirst("Content-Length");
        if (length != null) {
            try {
                long size = Long.parseLong(length);
                if (size < 0) throw new NumberFormatException();
                if (size > MAX_BODY_BYTES) throw new ApiException(413, "Request body is too large");
            } catch (NumberFormatException error) {
                throw new ApiException(400, "Invalid Content-Length");
            }
        }
        byte[] bytes = exchange.getRequestBody().readNBytes(MAX_BODY_BYTES + 1);
        if (bytes.length > MAX_BODY_BYTES) throw new ApiException(413, "Request body is too large");
        try {
            String json = StandardCharsets.UTF_8.newDecoder()
                    .onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT)
                    .decode(ByteBuffer.wrap(bytes)).toString();
            try (JsonReader reader = new JsonReader(new StringReader(json))) {
                reader.setLenient(false);
                JsonElement result = readStrictJson(reader, 0);
                if (!result.isJsonObject() || reader.peek() != JsonToken.END_DOCUMENT) {
                    throw new ApiException(400, "Body must contain one JSON object");
                }
                return result.getAsJsonObject();
            }
        } catch (CharacterCodingException error) {
            throw new ApiException(400, "Body must be UTF-8");
        } catch (IllegalStateException | NumberFormatException | IOException error) {
            throw new ApiException(400, "Malformed JSON body");
        }
    }

    // JsonParser.parseString enables lenient parsing in Gson 2.10. Read the small
    // request explicitly to reject JS-style names, trailing JSON and duplicates.
    private static JsonElement readStrictJson(JsonReader reader, int depth) throws IOException {
        if (depth > 32) throw new ApiException(400, "JSON is too deeply nested");
        return switch (reader.peek()) {
            case BEGIN_OBJECT -> {
                JsonObject object = new JsonObject();
                reader.beginObject();
                while (reader.hasNext()) {
                    String name = reader.nextName();
                    if (object.has(name)) throw new ApiException(400, "Duplicate JSON property");
                    object.add(name, readStrictJson(reader, depth + 1));
                }
                reader.endObject();
                yield object;
            }
            case BEGIN_ARRAY -> {
                JsonArray array = new JsonArray();
                reader.beginArray();
                while (reader.hasNext()) array.add(readStrictJson(reader, depth + 1));
                reader.endArray();
                yield array;
            }
            case STRING -> new JsonPrimitive(reader.nextString());
            case NUMBER -> new JsonPrimitive(new BigDecimal(reader.nextString()));
            case BOOLEAN -> new JsonPrimitive(reader.nextBoolean());
            case NULL -> {
                reader.nextNull();
                yield JsonNull.INSTANCE;
            }
            default -> throw new ApiException(400, "Malformed JSON body");
        };
    }

    private static JsonObject await(CompletableFuture<JsonObject> future) {
        try {
            return Objects.requireNonNull(future).get(BACKEND_TIMEOUT_MS, TimeUnit.MILLISECONDS);
        } catch (TimeoutException error) {
            future.cancel(false);
            throw new ApiException(503, "Game thread response timed out");
        } catch (InterruptedException error) {
            future.cancel(false);
            Thread.currentThread().interrupt();
            throw new ApiException(503, "Bridge is stopping");
        } catch (ExecutionException | CompletionException error) {
            Throwable cause = error.getCause();
            while (cause instanceof CompletionException && cause.getCause() != null) cause = cause.getCause();
            if (cause instanceof ApiException apiError) throw apiError;
            throw new ApiException(500, "Game request failed");
        }
    }

    private static void respondError(HttpExchange exchange, int status, String message) {
        JsonObject error = new JsonObject();
        error.addProperty("ok", false);
        error.addProperty("error", message);
        try {
            respond(exchange, status, error);
        } catch (IOException ignored) {
            // The caller may have disconnected or exceeded its request deadline.
        }
    }

    private static void respond(HttpExchange exchange, int status, JsonObject body) throws IOException {
        byte[] bytes = GSON.toJson(body).getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        exchange.getResponseHeaders().set("Cache-Control", "no-store");
        exchange.getResponseHeaders().set("X-Content-Type-Options", "nosniff");
        exchange.sendResponseHeaders(status, bytes.length);
        exchange.getResponseBody().write(bytes);
    }
}
