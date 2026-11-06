package com.daystaff.app.kiosk;

import android.app.Activity;
import android.os.Bundle;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

public class KioskLockTaskModule extends ReactContextBaseJavaModule {

  public KioskLockTaskModule(ReactApplicationContext reactContext) {
    super(reactContext);
  }

  @Override
  public String getName() {
    return "KioskLockTask";
  }

  /**
   * Starts lock task mode on the current Activity. Requires the app to be
   * whitelisted (android:lockTaskMode="if_whitelisted" in AndroidManifest.xml)
   * and/or device owner privileges. Falls back to screen pinning on devices
   * without device owner.
   */
  @ReactMethod
  public void enableKiosk(Promise promise) {
    Activity activity = getCurrentActivity();
    if (activity == null) {
      promise.reject("NO_ACTIVITY", "No current activity available to start lock task.");
      return;
    }
    try {
      activity.startLockTask();
      promise.resolve(null);
    } catch (IllegalStateException e) {
      promise.reject("LOCK_TASK_FAILED", e.getMessage());
    } catch (SecurityException e) {
      promise.reject("LOCK_TASK_SECURITY", "App is not whitelisted for lock task mode. Contact your administrator.");
    } catch (Exception e) {
      promise.reject("LOCK_TASK_ERROR", e.getMessage());
    }
  }

  /**
   * Stops lock task mode and returns the device to normal operation.
   */
  @ReactMethod
  public void disableKiosk(Promise promise) {
    Activity activity = getCurrentActivity();
    if (activity == null) {
      promise.reject("NO_ACTIVITY", "No current activity available to stop lock task.");
      return;
    }
    try {
      activity.stopLockTask();
      promise.resolve(null);
    } catch (IllegalStateException e) {
      promise.reject("LOCK_TASK_FAILED", e.getMessage());
    } catch (Exception e) {
      promise.reject("LOCK_TASK_ERROR", e.getMessage());
    }
  }

}
