/**
 * Auto-detect current URL and set OAuth redirect URI
 */

document.addEventListener('DOMContentLoaded', () => {
  const oauthInput = document.getElementById('oauthRedirectUri');
  if (oauthInput && !oauthInput.value.includes(window.location.hostname)) {
    const currentOrigin = window.location.origin;
    oauthInput.value = `${currentOrigin}/auth/callback`;
    
    // Also update the placeholder to show the detected URL
    oauthInput.placeholder = `${currentOrigin}/auth/callback`;
    
    console.log('[SetupUrlDetection] Auto-detected OAuth redirect URI:', `${currentOrigin}/auth/callback`);
  }
});