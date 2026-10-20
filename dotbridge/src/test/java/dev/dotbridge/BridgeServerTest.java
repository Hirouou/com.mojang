package dev.dotbridge;

import com.google.gson.JsonObject;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.*;

class BridgeServerTest {
    private static final String TOKEN = "test-only-secret-token";
    private BridgeServer server;
    private final AtomicInteger observedRadius = new AtomicInteger();
    private final AtomicInteger actionCalls = new AtomicInteger();
    private final AtomicReference<CompletableFuture<JsonObject>> actionResult = new AtomicReference<>();

    @BeforeEach
    void start() throws IOException {
        JsonObject accepted = new JsonObject();
        accepted.addProperty("ok", true);
        accepted.addProperty("action_id", "test-action");
        actionResult.set(CompletableFuture.completedFuture(accepted));
        server = new BridgeServer(0, TOKEN, new BridgeServer.Backend() {
            @Override
            public JsonObject state() {
                JsonObject state = new JsonObject();
                state.addProperty("tick", 42);
                return state;
            }

            @Override
            public CompletableFuture<JsonObject> observe(int radius) {
                observedRadius.set(radius);
                JsonObject result = new JsonObject();
                result.addProperty("radius", radius);
                return CompletableFuture.completedFuture(result);
            }

            @Override
            public CompletableFuture<JsonObject> action(JsonObject body) {
                actionCalls.incrementAndGet();
                return actionResult.get();
            }
        });
        server.start();
    }

    @AfterEach
    void stop() {
        if (server != null) server.close();
    }

    @Test
    void healthIsPublicButStateRequiresToken() throws IOException {
        Response health = request("GET", "/health", null, false, Map.of());
        assertEquals(200, health.status());
        assertTrue(health.body().contains("\"minecraft\":\"1.21.1\""));
        assertTrue(health.headers().toLowerCase().contains("cache-control: no-store"));
        assertEquals(401, request("GET", "/v1/state", null, false, Map.of()).status());
        assertEquals(401, request("GET", "/v1/state", null, false,
                Map.of("Authorization", "Bearer wrong")).status());
        Response state = request("GET", "/v1/state", null, true, Map.of());
        assertEquals(200, state.status());
        assertTrue(state.body().contains("42"));
        assertFalse(state.body().contains(TOKEN));
    }

    @Test
    void rejectsBrowserOriginsAndReboundHosts() throws IOException {
        assertEquals(403, request("GET", "/health", null, false,
                Map.of("Host", "attacker.example:" + server.getPort())).status());
        assertEquals(403, request("GET", "/v1/state", null, true,
                Map.of("Origin", "https://attacker.example")).status());
        assertEquals(403, request("GET", "/health", null, false,
                Map.of("Origin", "null")).status());
        assertEquals(200, request("GET", "/health", null, false,
                Map.of("Host", "localhost:" + server.getPort())).status());
        assertEquals(403, request("GET", "/health", null, false,
                Map.of("Host", "localhost:" + (server.getPort() + 1))).status());
    }

    @Test
    void actionAcceptsOneStrictJsonObject() throws IOException {
        assertEquals(202, request("POST", "/v1/action", "{\"type\":\"stop\"}", true, Map.of()).status());
        assertEquals(1, actionCalls.get());
        for (String malformed : new String[]{"", "[]", "null", "{type:'stop'}", "{\"type\":\"stop\",}",
                "{} {}", "{\"type\":\"stop\",\"type\":\"control\"}", "/*x*/{}", "{\"ticks\":NaN}"}) {
            assertEquals(400, request("POST", "/v1/action", malformed, true, Map.of()).status(), malformed);
        }
        assertEquals(1, actionCalls.get(), "Malformed requests must not reach the game backend");
    }

    @Test
    void actionRequiresJsonAndLimitsRequestSize() throws IOException {
        assertEquals(415, request("POST", "/v1/action", "{}", true,
                Map.of("Content-Type", "text/plain")).status());
        assertEquals(202, request("POST", "/v1/action", "{}", true,
                Map.of("Content-Type", "application/json; charset=utf-8")).status());
        assertEquals(413, request("POST", "/v1/action", " ".repeat(8193), true, Map.of()).status());
        assertEquals(400, request("POST", "/v1/action", "[".repeat(34) + "]".repeat(34), true, Map.of()).status());
    }

    @Test
    void validatesRadiusBeforeCallingBackend() throws IOException {
        assertEquals(200, request("GET", "/v1/observe", null, true, Map.of()).status());
        assertEquals(4, observedRadius.get());
        assertEquals(200, request("GET", "/v1/observe?radius=8", null, true, Map.of()).status());
        assertEquals(8, observedRadius.get());
        for (String query : new String[]{"radius=0", "radius=9", "radius=1.5", "radius=1&radius=2", "other=2", "radius="}) {
            assertEquals(400, request("GET", "/v1/observe?" + query, null, true, Map.of()).status(), query);
        }
        assertEquals(8, observedRadius.get());
    }

    @Test
    void enforcesExactPathsMethodsAndQueries() throws IOException {
        Response wrongMethod = request("POST", "/health", "{}", false, Map.of());
        assertEquals(405, wrongMethod.status());
        assertTrue(wrongMethod.headers().toLowerCase().contains("allow: get"));
        assertEquals(404, request("GET", "/v1/state/extra", null, true, Map.of()).status());
        assertEquals(400, request("GET", "/v1/state?ignored=1", null, true, Map.of()).status());
        assertEquals(405, request("GET", "/v1/action", null, true, Map.of()).status());
    }

    @Test
    void reportsBackendApiErrorsAndHidesUnexpectedDetails() throws IOException {
        actionResult.set(CompletableFuture.failedFuture(new BridgeServer.ApiException(409, "Game is paused")));
        Response paused = request("POST", "/v1/action", "{}", true, Map.of());
        assertEquals(409, paused.status());
        assertTrue(paused.body().contains("Game is paused"));
        actionResult.set(CompletableFuture.failedFuture(new IllegalStateException("private detail " + TOKEN)));
        Response failed = request("POST", "/v1/action", "{}", true, Map.of());
        assertEquals(500, failed.status());
        assertFalse(failed.body().contains("private detail"));
        assertFalse(failed.body().contains(TOKEN));
    }

    @Test
    void cancelsTimedOutGameRequests() throws IOException {
        CompletableFuture<JsonObject> pending = new CompletableFuture<>();
        actionResult.set(pending);
        Response timedOut = request("POST", "/v1/action", "{}", true, Map.of());
        assertEquals(503, timedOut.status());
        assertTrue(pending.isCancelled(), "Queued work must be able to skip a request that timed out");
    }

    private Response request(String method, String path, String body, boolean authenticated,
                             Map<String, String> headers) throws IOException {
        byte[] bytes = body == null ? new byte[0] : body.getBytes(StandardCharsets.UTF_8);
        StringBuilder request = new StringBuilder(method).append(' ').append(path).append(" HTTP/1.1\r\n");
        request.append("Host: ").append(headers.getOrDefault("Host", "127.0.0.1:" + server.getPort())).append("\r\n");
        request.append("Connection: close\r\n");
        if (authenticated) request.append("Authorization: Bearer ").append(TOKEN).append("\r\n");
        if (body != null) {
            request.append("Content-Length: ").append(bytes.length).append("\r\n");
            request.append("Content-Type: ").append(headers.getOrDefault("Content-Type", "application/json")).append("\r\n");
        }
        headers.forEach((name, value) -> {
            if (!name.equals("Host") && !name.equals("Content-Type")) {
                request.append(name).append(": ").append(value).append("\r\n");
            }
        });
        request.append("\r\n");
        try (Socket socket = new Socket("127.0.0.1", server.getPort())) {
            socket.setSoTimeout(6000);
            socket.getOutputStream().write(request.toString().getBytes(StandardCharsets.US_ASCII));
            socket.getOutputStream().write(bytes);
            socket.getOutputStream().flush();
            String raw = new String(socket.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
            int split = raw.indexOf("\r\n\r\n");
            assertTrue(split >= 0, raw);
            int status = Integer.parseInt(raw.substring(0, raw.indexOf("\r\n")).split(" ")[1]);
            return new Response(status, raw.substring(0, split), raw.substring(split + 4));
        }
    }

    private record Response(int status, String headers, String body) {}
}
