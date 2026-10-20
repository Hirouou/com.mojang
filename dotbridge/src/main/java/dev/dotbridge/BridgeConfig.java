package dev.dotbridge;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.FileAlreadyExistsException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.nio.file.attribute.PosixFilePermissions;
import java.security.SecureRandom;
import java.util.HexFormat;

/** Local settings and a persistent secret; never logs the secret itself. */
final class BridgeConfig {
    private static final Gson JSON = new GsonBuilder().setPrettyPrinting().create();
    final int port;
    final boolean backgroundControl;
    final String token;

    private BridgeConfig(int port, boolean backgroundControl, String token) {
        this.port = port;
        this.backgroundControl = backgroundControl;
        this.token = token;
    }

    static BridgeConfig load(Path configDir) throws IOException {
        Files.createDirectories(configDir);
        Path settings = configDir.resolve("dotbridge.json");
        if (!Files.exists(settings)) {
            JsonObject defaults = new JsonObject();
            defaults.addProperty("port", 8765);
            defaults.addProperty("backgroundControl", true);
            try {
                Files.writeString(settings, JSON.toJson(defaults) + "\n", StandardCharsets.UTF_8,
                        StandardOpenOption.CREATE_NEW);
            } catch (FileAlreadyExistsException ignored) {
                // Another client may have created the settings meanwhile.
            }
        }
        try {
            JsonObject config = JsonParser.parseString(Files.readString(settings)).getAsJsonObject();
            int port = 8765;
            if (config.has("port")) {
                var value = config.get("port");
                if (!value.isJsonPrimitive() || !value.getAsJsonPrimitive().isNumber()
                        || value.getAsBigDecimal().stripTrailingZeros().scale() > 0) {
                    throw new IllegalArgumentException("port must be an integer");
                }
                port = value.getAsBigDecimal().intValueExact();
            }
            boolean background = true;
            if (config.has("backgroundControl")) {
                var value = config.get("backgroundControl");
                if (!value.isJsonPrimitive() || !value.getAsJsonPrimitive().isBoolean()) {
                    throw new IllegalArgumentException("backgroundControl must be boolean");
                }
                background = value.getAsBoolean();
            }
            if (port < 1024 || port > 65535) throw new IllegalArgumentException("port must be 1024..65535");
            Path tokenFile = configDir.resolve("dotbridge.token");
            if (!Files.exists(tokenFile)) {
                byte[] secret = new byte[32];
                new SecureRandom().nextBytes(secret);
                try {
                    if (Files.getFileStore(configDir).supportsFileAttributeView("posix")) {
                        Files.createFile(tokenFile, PosixFilePermissions.asFileAttribute(
                                PosixFilePermissions.fromString("rw-------")));
                    } else {
                        Files.createFile(tokenFile);
                    }
                    Files.writeString(tokenFile, HexFormat.of().formatHex(secret) + "\n",
                            StandardCharsets.UTF_8, StandardOpenOption.TRUNCATE_EXISTING);
                } catch (FileAlreadyExistsException ignored) {
                    // Read the existing secret below.
                }
            }
            if (Files.getFileStore(configDir).supportsFileAttributeView("posix")) {
                Files.setPosixFilePermissions(tokenFile, PosixFilePermissions.fromString("rw-------"));
            }
            String token = Files.readString(tokenFile, StandardCharsets.UTF_8).trim();
            if (!token.matches("[a-f0-9]{64}")) {
                throw new IllegalArgumentException("invalid dotbridge.token; remove it with Minecraft closed to regenerate");
            }
            return new BridgeConfig(port, background, token);
        } catch (IllegalArgumentException | ArithmeticException | IllegalStateException e) {
            throw new IOException("Invalid DotBridge config: " + e.getMessage(), e);
        }
    }
}
