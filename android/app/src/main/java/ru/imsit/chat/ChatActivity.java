package ru.imsit.chat;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.pm.ApplicationInfo;
import android.graphics.Color;
import android.graphics.Insets;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.text.InputType;
import android.view.View;
import android.view.WindowInsets;
import android.window.OnBackInvokedDispatcher;
import android.webkit.CookieManager;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

public final class ChatActivity extends Activity {
    private FrameLayout root;
    private WebView chat;
    private ServerAddress server;
    private boolean foreground;

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(245, 246, 249));
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
            root.setOnApplyWindowInsetsListener((view, insets) -> {
                Insets edges = insets.getInsets(WindowInsets.Type.systemBars()
                        | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
                view.setPadding(edges.left, edges.top, edges.right, edges.bottom);
                return WindowInsets.CONSUMED;
            });
        }
        setContentView(root);
        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                    OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::navigateBack);
        }
        server = new ServerAddress(getPreferences(MODE_PRIVATE).getString("server", ServerAddress.DEFAULT));
        String route = saved != null && server.origin.equals(saved.getString("origin")) ? saved.getString("route") : null;
        openChat(route);
    }

    private void openChat(String route) {
        chat = new WebView(this);
        WebSettings settings = chat.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(chat, false);
        WebView.setWebContentsDebuggingEnabled((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0);
        chat.setWebViewClient(new ChatContent(getAssets(), server, this::showServerDialog, this::updateVisibility));
        root.addView(chat);
        boolean knownRoute = route != null && route.matches("/(login|register|new|admin|dialogs(/[0-9]+)?)");
        chat.loadUrl(server.origin + "/" + (knownRoute ? "#" + route : ""));
    }

    private void showServerDialog() {
        LinearLayout fields = new LinearLayout(this);
        fields.setOrientation(LinearLayout.VERTICAL);
        int padding = Math.round(24 * getResources().getDisplayMetrics().density);
        fields.setPadding(padding, padding / 2, padding, 0);
        EditText address = new EditText(this);
        address.setSingleLine();
        address.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        address.setText(server.origin);
        address.setSelectAllOnFocus(true);
        address.setContentDescription("Адрес сервера");
        fields.addView(address);
        TextView hint = new TextView(this);
        hint.setText("По USB используйте localhost после настройки adb reverse. По Wi-Fi введите адрес компьютера с запущенным iMSITChat. При смене сервера потребуется вход.");
        fields.addView(hint);
        AlertDialog dialog = new AlertDialog.Builder(this).setTitle("Адрес сервера")
                .setView(fields).setNegativeButton("Отмена", null).setPositiveButton("Подключиться", null).create();
        dialog.setOnShowListener(ignored -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(button -> {
            try {
                ServerAddress selected = new ServerAddress(address.getText().toString());
                dialog.dismiss();
                if (server.origin.equals(selected.origin)) {
                    chat.reload();
                    return;
                }
                disposeChat();
                CookieManager.getInstance().removeAllCookies(removed -> {
                    if (isFinishing() || isDestroyed()) return;
                    server = selected;
                    getPreferences(MODE_PRIVATE).edit().putString("server", server.origin).apply();
                    openChat(null);
                });
            } catch (IllegalArgumentException error) {
                address.setError(error.getMessage());
            }
        }));
        dialog.show();
    }

    private String route() {
        String url = chat == null ? null : chat.getUrl();
        return url == null ? null : Uri.parse(url).getFragment();
    }

    @Override
    protected void onSaveInstanceState(Bundle state) {
        super.onSaveInstanceState(state);
        state.putString("origin", server.origin);
        state.putString("route", route());
    }

    @Override
    public void onBackPressed() {
        navigateBack();
    }

    private void navigateBack() {
        String route = route();
        if (route != null && (route.startsWith("/dialogs/") || route.equals("/new") || route.equals("/admin"))) {
            chat.loadUrl(server.origin + "/#/dialogs");
        } else if ("/register".equals(route)) {
            chat.loadUrl(server.origin + "/#/login");
        } else {
            finish();
        }
    }

    private void updateVisibility() {
        if (chat != null) {
            String state = foreground ? "true" : "false";
            chat.evaluateJavascript("window.imsitForeground=" + state
                    + ";window.dispatchEvent(new Event('imsit-visibility'))", null);
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        foreground = true;
        updateVisibility();
    }

    @Override
    protected void onPause() {
        foreground = false;
        updateVisibility();
        CookieManager.getInstance().flush();
        super.onPause();
    }

    @Override
    protected void onStart() {
        super.onStart();
        if (chat != null) {
            chat.setVisibility(View.VISIBLE);
            chat.onResume();
        }
    }

    @Override
    protected void onStop() {
        if (chat != null) {
            chat.setVisibility(View.INVISIBLE);
            chat.onPause();
        }
        CookieManager.getInstance().flush();
        super.onStop();
    }

    private void disposeChat() {
        if (chat == null) return;
        root.removeView(chat);
        chat.destroy();
        chat = null;
    }

    @Override
    protected void onDestroy() {
        disposeChat();
        super.onDestroy();
    }
}
