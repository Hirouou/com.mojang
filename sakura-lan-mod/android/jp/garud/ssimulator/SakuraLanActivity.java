package jp.garud.ssimulator;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

public final class SakuraLanActivity extends Activity {
    static {
        System.loadLibrary("sakuralan");
    }

    private static native int nativeHost();
    private static native int nativeJoin();
    private static native int nativeConnected();

    private LinearLayout root;
    private TextView status;
    private Button hostButton;
    private Button joinButton;
    private ProgressBar progress;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        buildUi();
    }

    private TextView makeText(String text, float sp, int color) {
        TextView t = new TextView(this);
        t.setText(text);
        t.setTextSize(sp);
        t.setTextColor(color);
        t.setGravity(Gravity.CENTER);
        t.setPadding(24, 16, 24, 16);
        return t;
    }

    private Button makeButton(String text) {
        Button b = new Button(this);
        b.setText(text);
        b.setTextSize(18f);
        b.setAllCaps(false);
        b.setMinHeight(120);
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT);
        p.setMargins(32, 14, 32, 14);
        b.setLayoutParams(p);
        return b;
    }

    private void buildUi() {
        root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER);
        root.setPadding(48, 64, 48, 64);
        root.setBackgroundColor(Color.rgb(25, 25, 32));

        TextView title = makeText("SAKURA LAN", 34f, Color.WHITE);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        root.addView(title);

        TextView subtitle = makeText(
                "Multiplayer local • 2 jogadores • mesmo Wi-Fi",
                16f,
                Color.rgb(210, 210, 220));
        root.addView(subtitle);

        status = makeText("Escolha como entrar.", 15f, Color.rgb(170, 220, 255));
        root.addView(status);

        progress = new ProgressBar(this);
        progress.setVisibility(View.GONE);
        root.addView(progress);

        hostButton = makeButton("Criar sala");
        joinButton = makeButton("Entrar na sala");

        hostButton.setOnClickListener(v -> createRoom());
        joinButton.setOnClickListener(v -> joinRoom());

        root.addView(hostButton);
        root.addView(joinButton);

        TextView tip = makeText(
                "O outro celular precisa estar conectado à mesma rede Wi-Fi.",
                13f,
                Color.rgb(170, 170, 180));
        root.addView(tip);

        setContentView(root);
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
        setBusy(true, "Procurando sala na rede...");
        new Thread(() -> {
            final int ok = nativeJoin();
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
            Intent game = new Intent();
            game.setClassName(this, "com.unity3d.player.UnityPlayerActivity");
            startActivity(game);
            finish();
        } catch (Throwable t) {
            setBusy(false, "Erro ao abrir o Sakura: " + t.getClass().getSimpleName());
        }
    }
}
