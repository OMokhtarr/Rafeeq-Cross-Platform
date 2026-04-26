package com.rafeeq.quranquiz;

import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        // Enable edge-to-edge display for Android 15+
        enableEdgeToEdge();
    }
    
    private void enableEdgeToEdge() {
        // Make the content draw behind system bars
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        
        // Make status and navigation bars transparent
        getWindow().setStatusBarColor(android.graphics.Color.TRANSPARENT);
        getWindow().setNavigationBarColor(android.graphics.Color.TRANSPARENT);
        
        // Optional: Change the icons to light/dark based on your theme
        WindowInsetsControllerCompat controller = new WindowInsetsControllerCompat(getWindow(), getWindow().getDecorView());
        controller.setAppearanceLightStatusBars(false); // false = light icons, true = dark icons
        controller.setAppearanceLightNavigationBars(false);
    }
}