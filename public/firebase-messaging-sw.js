importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js");

// Config is injected at runtime — service worker can't access import.meta.env
// so we fetch it from the main app via a message or use a hardcoded fallback
self.addEventListener("message", (event) => {
  if (event.data?.type === "FIREBASE_CONFIG") {
    firebase.initializeApp(event.data.config);
    const messaging = firebase.messaging();
    messaging.onBackgroundMessage((payload) => {
      const { title, body, icon } = payload.notification || {};
      self.registration.showNotification(title || "Hinker", {
        body: body || "",
        icon: icon || "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
      });
    });
  }
});
