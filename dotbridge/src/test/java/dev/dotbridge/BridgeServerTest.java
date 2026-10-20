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
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.*;

class BridgeServerTest {
    private static final String TOKEN = "test-only-secret-token";
    private BridgeServer server;
    private final AtomicInteger observedRadius = new AtomicInteger();
    private final AtomicInteger actionCalls = new AtomicInteger();
    private final AtomicReference<CompletableFuture<JsonObject>> actionResult = new AtomicReference<>();
    private final AtomicInteger newApiCalls = new AtomicInteger();
    private final AtomicLong observedAfter = new AtomicLong(-1);
    private final AtomicReference<String> observedRoute = new AtomicReference<>();
    private final AtomicReference<JsonObject> observedBody = new AtomicReference<>();
    private final AtomicReference<CompletableFuture<JsonObject>> newApiResult = new AtomicReference<>();
    private boolean newApiSupported = true;

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

            @Override
            public CompletableFuture<JsonObject> heartbeat(JsonObject body) {
                return newApiSupported ? newApiResponse("heartbeat", body) : BridgeServer.Backend.super.heartbeat(body);
            }

            @Override
            public CompletableFuture<JsonObject> goal(JsonObject body) {
                return newApiSupported ? newApiResponse("goal", body) : BridgeServer.Backend.super.goal(body);
            }

            @Override
            public CompletableFuture<JsonObject> events(long after) {
                if (!newApiSupported) return BridgeServer.Backend.super.events(after);
                observedAfter.set(after);
                return newApiResponse("events", null);
            }

            @Override
            public CompletableFuture<JsonObject> inventory() {
                return newApiSupported ? newApiResponse("inventory", null) : BridgeServer.Backend.super.inventory();
            }

            @Override
            public CompletableFuture<JsonObject> inventoryAction(JsonObject body) {
                return newApiSupported ? newApiResponse("inventoryAction", body) : BridgeServer.Backend.super.inventoryAction(body);
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
        assertTrue(health.body().contains("\"version\":\"1.1.0\""));
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

    @Test
    void dispatchesNewEndpointsWithCompatibleStatusesAndBodies() throws IOException {
        assertEquals(200, request("POST", "/v1/heartbeat", "{\"ttl_ticks\":40}", true, Map.of()).status());
        assertEquals("heartbeat", observedRoute.get());
        assertEquals(40, observedBody.get().get("ttl_ticks").getAsInt());
        assertEquals(202, request("POST", "/v1/goal", "{\"type\":\"observe\"}", true, Map.of()).status());
        assertEquals("goal", observedRoute.get());
        assertEquals("observe", observedBody.get().get("type").getAsString());
        assertEquals(200, request("GET", "/v1/inventory", null, true, Map.of()).status());
        assertEquals("inventory", observedRoute.get());
        assertNull(observedBody.get());
        assertEquals(202, request("POST", "/v1/inventory", "{\"slot\":12}", true, Map.of()).status());
        assertEquals("inventoryAction", observedRoute.get());
        assertEquals(12, observedBody.get().get("slot").getAsInt());
        assertEquals(200, request("GET", "/v1/events", null, true, Map.of()).status());
        assertEquals("events", observedRoute.get());
        assertEquals(0, observedAfter.get());
    }

    @Test
    void allNewEndpointsRetainAuthenticationHostAndOriginChecks() throws IOException {
        String[][] routes = {{"POST", "/v1/heartbeat"}, {"POST", "/v1/goal"},
                {"GET", "/v1/events"}, {"GET", "/v1/inventory"}, {"POST", "/v1/inventory"}};
        for (String[] route : routes) {
            String body = route[0].equals("POST") ? "{}" : null;
            assertEquals(401, request(route[0], route[1], body, false, Map.of()).status(), route[1]);
            assertEquals(403, request(route[0], route[1], body, true,
                    Map.of("Origin", "null")).status(), route[1]);
            assertEquals(403, request(route[0], route[1], body, true,
                    Map.of("Host", "external.example:" + server.getPort())).status(), route[1]);
        }
        assertEquals(0, newApiCalls.get());
    }

    @Test
    void newPostEndpointsRetainStrictJsonAndBodyLimits() throws IOException {
        for (String path : new String[]{"/v1/heartbeat", "/v1/goal", "/v1/inventory"}) {
            assertEquals(400, request("POST", path, "{unquoted:true}", true, Map.of()).status(), path);
            assertEquals(400, request("POST", path, "[]", true, Map.of()).status(), path);
            assertEquals(413, request("POST", path, " ".repeat(8193), true, Map.of()).status(), path);
            assertEquals(415, request("POST", path, "{}", true,
                    Map.of("Content-Type", "text/plain")).status(), path);
        }
        assertEquals(0, newApiCalls.get());
    }

    @Test
    void validatesEventCursorWithoutTruncationOrExtraParameters() throws IOException {
        assertEquals(200, request("GET", "/v1/events?after=9223372036854775807", null, true, Map.of()).status());
        assertEquals(Long.MAX_VALUE, observedAfter.get());
        assertEquals(200, request("GET", "/v1/events?after=%31%32", null, true, Map.of()).status());
        assertEquals(12, observedAfter.get());
        for (String query : new String[]{"after=-1", "after=1.5", "after=", "after=%2B1", "other=1",
                "after=1&after=2", "after=1&other=2", "after=9223372036854775808"}) {
            assertEquals(400, request("GET", "/v1/events?" + query, null, true, Map.of()).status(), query);
        }
        assertEquals(12, observedAfter.get(), "Invalid cursors must never reach the backend");
    }

    @Test
    void newEndpointsEnforceMethodsAndRejectUnexpectedQueries() throws IOException {
        assertEquals(405, request("GET", "/v1/heartbeat", null, true, Map.of()).status());
        assertEquals(405, request("GET", "/v1/goal", null, true, Map.of()).status());
        assertEquals(405, request("POST", "/v1/events", "{}", true, Map.of()).status());
        Response wrongInventoryMethod = request("PUT", "/v1/inventory", "{}", true, Map.of());
        assertEquals(405, wrongInventoryMethod.status());
        assertTrue(wrongInventoryMethod.headers().toLowerCase().contains("allow: get, post"));
        for (String path : new String[]{"/v1/heartbeat", "/v1/goal", "/v1/inventory"}) {
            assertEquals(400, request("POST", path + "?extra=1", "{}", true, Map.of()).status(), path);
        }
        assertEquals(400, request("GET", "/v1/inventory?extra=1", null, true, Map.of()).status());
        assertEquals(404, request("POST", "/v1/goal/extra", "{}", true, Map.of()).status());
        assertEquals(0, newApiCalls.get());
    }

    @Test
    void oldBackendsReturnUnsupportedWithoutBreakingExistingActions() throws IOException {
        newApiSupported = false;
        assertEquals(404, request("POST", "/v1/heartbeat", "{}", true, Map.of()).status());
        assertEquals(404, request("POST", "/v1/goal", "{}", true, Map.of()).status());
        assertEquals(404, request("GET", "/v1/events", null, true, Map.of()).status());
        assertEquals(404, request("GET", "/v1/inventory", null, true, Map.of()).status());
        assertEquals(404, request("POST", "/v1/inventory", "{}", true, Map.of()).status());
        assertEquals(202, request("POST", "/v1/action", "{\"type\":\"stop\"}", true, Map.of()).status());
    }

    @Test
    void newEndpointsPreserveBackendErrorsAndCancelTimeouts() throws IOException {
        newApiResult.set(CompletableFuture.failedFuture(new BridgeServer.ApiException(409, "Controller expired")));
        Response conflict = request("POST", "/v1/goal", "{}", true, Map.of());
        assertEquals(409, conflict.status());
        assertTrue(conflict.body().contains("Controller expired"));
        CompletableFuture<JsonObject> pending = new CompletableFuture<>();
        newApiResult.set(pending);
        assertEquals(503, request("POST", "/v1/heartbeat", "{}", true, Map.of()).status());
        assertTrue(pending.isCancelled());
    }

    private CompletableFuture<JsonObject> newApiResponse(String route, JsonObject body) {
        newApiCalls.incrementAndGet();
        observedRoute.set(route);
        observedBody.set(body);
        if (newApiResult.get() != null) return newApiResult.get();
        JsonObject response = new JsonObject();
        response.addProperty("ok", true);
        response.addProperty("endpoint", route);
        return CompletableFuture.completedFuture(response);
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
