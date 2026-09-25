package jp.garud.ssimulator;

import android.app.Activity;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Typeface;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

public final class SakuraLanActivity extends Activity {
    static {
        System.loadLibrary("sakuralan");
    }

    private static native int nativeHost();
    private static native int nativeJoin();
    private static native int nativeJoinAddress(String host, int port);
    private static native int nativeConnected();
    private static native void nativeSetCiPose(boolean enabled);

    private LinearLayout root;
    private TextView status;
    private Button hostButton;
    private Button joinButton;
    private EditText hostAddress;
    private ProgressBar progress;

    private String debugJoinHost;
    private int debugJoinPort = 38556;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        if (getActionBar() != null) getActionBar().hide();
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN,
                WindowManager.LayoutParams.FLAG_FULLSCREEN);
        buildUi();

        // CI/debug shortcut: allows two automated Android instances to choose
        // Host or Join without relying on fragile screen-coordinate taps.
        final Intent intent = getIntent();
        final String mode = intent.getStringExtra("sakuralan_mode");
        debugJoinHost = intent.getStringExtra("sakuralan_host");
        debugJoinPort = intent.getIntExtra("sakuralan_port", 38556);
        if (debugJoinHost != null) hostAddress.setText(debugJoinHost);
        nativeSetCiPose(intent.getBooleanExtra("sakuralan_ci_pose", false));

        if ("host".equalsIgnoreCase(mode)) {
            root.postDelayed(this::createRoom, 350);
        } else if ("join".equalsIgnoreCase(mode)) {
            root.postDelayed(this::joinRoom, 900);
        }
    }

    private TextView makeText(String text, float sp, int color) {
        TextView t = new TextView(this);
        t.setText(text);
        t.setTextSize(sp);
        t.setTextColor(color);
        t.setGravity(Gravity.CENTER);
        t.setPadding(12, 6, 12, 6);
        return t;
    }

    private Button makeButton(String text) {
        Button b = new Button(this);
        b.setText(text);
        b.setTextSize(18f);
        b.setAllCaps(false);
        b.setMinHeight(68);
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT);
        p.setMargins(12, 4, 12, 4);
        b.setLayoutParams(p);
        return b;
    }

    private void buildUi() {
        root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER);
        root.setPadding(16, 8, 16, 8);
        root.setBackgroundColor(Color.rgb(25, 25, 32));
        root.setFocusableInTouchMode(true);
        root.requestFocus();

        TextView title = makeText("SAKURA LAN", 28f, Color.WHITE);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        root.addView(title);

        TextView subtitle = makeText(
                "Multiplayer local • 2 jogadores • mesmo Wi-Fi",
                14f,
                Color.rgb(210, 210, 220));
        root.addView(subtitle);

        status = makeText("Escolha como entrar.", 15f, Color.rgb(170, 220, 255));
        root.addView(status);

        progress = new ProgressBar(this);
        progress.setVisibility(View.GONE);
        root.addView(progress);

        hostAddress = new EditText(this);
        hostAddress.setSingleLine(true);
        hostAddress.setHint("IP do Host (opcional)");
        hostAddress.setTextColor(Color.WHITE);
        hostAddress.setHintTextColor(Color.rgb(160, 160, 170));
        hostAddress.setPadding(24, 8, 24, 8);
        root.addView(hostAddress);

        hostButton = makeButton("Criar sala");
        joinButton = makeButton("Entrar na sala");

        hostButton.setOnClickListener(v -> createRoom());
        joinButton.setOnClickListener(v -> joinRoom());

        root.addView(hostButton);
        root.addView(joinButton);

        TextView tip = makeText(
                "Deixe o IP vazio para procurar na mesma rede Wi-Fi.",
                13f,
                Color.rgb(170, 170, 180));
        root.addView(tip);

        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.addView(root);
        setContentView(scroll);
    }

    private void setBusy(boolean busy, String text) {
        hostButton.setEnabled(!busy);
        joinButton.setEnabled(!busy);
        progress.setVisibility(busy ? View.VISIBLE : View.GONE);
        status.setText(text);
    }

    private void createRoom() {
        setBusy(true, "Criando sala...");
        new Thread(() -> {
            final int ok = nativeHost();
            runOnUiThread(() -> {
                if (ok == 1) {
                    status.setText("Sala criada. Abrindo o jogo...");
                    launchGame();
                } else {
                    setBusy(false, "Não foi possível criar a sala.");
                }
            });
        }, "SakuraLAN-Host").start();
    }

    private void joinRoom() {
        final String typedHost = hostAddress.getText().toString().trim();
        final String host = typedHost.isEmpty() ? debugJoinHost : typedHost;
        setBusy(true,
                host != null && !host.isEmpty()
                        ? "Conectando à sala..."
                        : "Procurando sala na rede...");

        new Thread(() -> {
            final int ok;
            if (host != null && !host.isEmpty()) {
                ok = nativeJoinAddress(host, debugJoinPort);
            } else {
                ok = nativeJoin();
            }

            runOnUiThread(() -> {
                if (ok == 1) {
                    status.setText("Conectado! Abrindo o jogo...");
                    launchGame();
                } else {
                    setBusy(false, "Nenhuma sala encontrada. Tente novamente.");
                    Toast.makeText(this,
                            "Nenhuma sala LAN encontrada na mesma rede.",
                            Toast.LENGTH_SHORT).show();
                }
            });
        }, "SakuraLAN-Join").start();
    }

    private void launchGame() {
        try {
            String className = "com.unity3d.player.UnityPlayerActivity";
            ApplicationInfo info = getPackageManager().getApplicationInfo(
                    getPackageName(), PackageManager.GET_META_DATA);
            if (info.metaData != null) {
                String saved = info.metaData.getString(
                        "jp.garud.ssimulator.SAKURA_ORIGINAL_ACTIVITY");
                if (saved != null && !saved.isEmpty()) className = saved;
            }
            if (className.startsWith(".")) className = getPackageName() + className;

            Intent game = new Intent();
            game.setClassName(getPackageName(), className);
            game.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP);
            startActivity(game);
            finish();
        } catch (Throwable t) {
            setBusy(false, "Erro ao abrir o Sakura: " + t.getClass().getSimpleName());
        }
    }
}
