// prevent execution on server side, or there will be ReferenceError: window is not defined raised from solid-auth-client
if (typeof window !== 'undefined') {
  require('./SyncAdaptor');
}
