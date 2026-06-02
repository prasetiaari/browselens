document.addEventListener('DOMContentLoaded', () => {
  const btnBack = document.getElementById('btn-back') as HTMLButtonElement;
  const btnForward = document.getElementById('btn-forward') as HTMLButtonElement;
  const btnReload = document.getElementById('btn-reload') as HTMLButtonElement;
  const btnRepeater = document.getElementById('btn-repeater') as HTMLButtonElement;
  const addressInput = document.getElementById('address-input') as HTMLInputElement;
  const miniIframe = document.getElementById('mini-iframe') as HTMLIFrameElement;

  // 1. Get initial URL from query parameters
  const params = new URLSearchParams(window.location.search);
  let initialUrl = params.get('url') || 'https://example.com';
  if (!initialUrl.startsWith('http://') && !initialUrl.startsWith('https://')) {
    initialUrl = 'https://' + initialUrl;
  }

  addressInput.value = initialUrl;
  miniIframe.src = initialUrl;

  // 2. Address bar navigation
  addressInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      let target = addressInput.value.trim();
      if (target) {
        if (!target.startsWith('http://') && !target.startsWith('https://')) {
          target = 'https://' + target;
        }
        addressInput.value = target;
        miniIframe.src = target;
      }
    }
  });

  // 3. Navigation Controls
  btnReload.addEventListener('click', () => {
    miniIframe.src = miniIframe.src;
  });

  btnBack.addEventListener('click', () => {
    try {
      window.history.back();
    } catch (_) {}
  });

  btnForward.addEventListener('click', () => {
    try {
      window.history.forward();
    } catch (_) {}
  });

  // 4. Send to Repeater Integration
  btnRepeater.addEventListener('click', () => {
    const currentUrl = addressInput.value;

    // Send a message to the runtime to trigger Repeater update
    chrome.runtime.sendMessage({
      type: 'SEND_TO_REPEATER',
      payload: {
        method: 'GET',
        url: currentUrl,
        headers: {},
        body: ''
      }
    });

    // Provide premium button feedback
    const originalText = btnRepeater.innerText;
    btnRepeater.innerText = '✓ Sent!';
    btnRepeater.style.color = 'var(--accent-green)';
    btnRepeater.style.borderColor = 'var(--accent-green)';
    btnRepeater.style.background = 'rgba(0, 255, 136, 0.1)';
    setTimeout(() => {
      btnRepeater.innerText = originalText;
      btnRepeater.style.color = 'var(--accent-cyan)';
      btnRepeater.style.borderColor = 'rgba(0, 229, 255, 0.3)';
      btnRepeater.style.background = 'rgba(0, 229, 255, 0.1)';
    }, 1500);
  });
});
