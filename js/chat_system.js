// =========================================================
// chat_system.js
// =========================================================

window.addLog = function(htmlText, type = 'sys') {
    // ★ 'chat' または 'sys' の場合は、チャットログ画面に追加する
    if (type === 'chat' || type === 'sys') {
        const chatLogContent = document.getElementById('chatLogContent');
        if (chatLogContent) {
            const chatLine = document.createElement('div');
            chatLine.className = `full-log-line log-type-${type}`;
            chatLine.innerHTML = htmlText;
            chatLogContent.appendChild(chatLine);
            chatLogContent.scrollTop = chatLogContent.scrollHeight;
        }
    }

    const chatTabBtn = document.querySelector('.bottom-tab-btn[data-target="chat"]');
    const isChatActive = chatTabBtn && chatTabBtn.classList.contains('active');
    
    // チャットタブが開いている時は、上に被るフローティングログは表示しない
    if (isChatActive) {
        return; 
    }

    const floatingLog = document.getElementById('floatingLog');
    if (!floatingLog) return;
    
    const floatLine = document.createElement('div');
    floatLine.className = `log-line log-type-${type}`;
    floatLine.innerHTML = htmlText;
    floatingLog.appendChild(floatLine);

    const removeFloatLine = () => {
        if(!floatLine.classList.contains('fade-out')) {
            floatLine.classList.add('fade-out');
            setTimeout(() => { if (floatLine.parentNode) floatLine.remove(); }, 500); 
        }
    };
    floatLine.timerId = setTimeout(removeFloatLine, 5000);

    const activeLines = Array.from(floatingLog.children).filter(child => !child.classList.contains('fade-out'));
    if (activeLines.length > 5) {
        const oldest = activeLines[0];
        clearTimeout(oldest.timerId); 
        if(!oldest.classList.contains('fade-out')) {
            oldest.classList.add('fade-out');
            setTimeout(() => { if (oldest.parentNode) oldest.remove(); }, 500);
        }
    }
};

window.sendChatMessage = function(text) {
    if (!text) return;
    
    let myName = 'Player';
    if (window.GameState && window.GameState.userInfo && window.GameState.userInfo.name) {
        myName = window.GameState.userInfo.name;
    }

    window.addLog(`<span style="color: #00ffff;">${myName}:</span> ${text}`, 'chat');
    
    if (window.player && typeof window.showChatBubble === 'function') {
        window.showChatBubble(window.player, text);
    }
    
    if (window.MultiplayerManager && typeof window.MultiplayerManager.sendData === 'function') {
        window.MultiplayerManager.sendData({
            type: 'chat',
            senderName: myName,
            text: text
        });
    }
};

window.initChatSystem = function() {
    const chatSendBtn = document.getElementById('chatSendBtn');
    const chatInput = document.getElementById('chatInput');

    if (chatSendBtn && chatInput) {
        chatInput.addEventListener('keypress', function (e) {
            if (e.key === 'Enter') {
                window.sendChatMessage(chatInput.value.trim());
                chatInput.value = '';
            }
        });

        chatSendBtn.addEventListener('click', () => {
            window.sendChatMessage(chatInput.value.trim());
            chatInput.value = '';
        });
    }

    let shortcuts = JSON.parse(localStorage.getItem('fallGraShortcuts')) || [
        "こんにちは！", "よろしく！", "ありがとう", "ごめん！", "上に乗せて！", "お疲れ様！"
    ];
    let isEditMode = false;

    function renderShortcuts() {
        const grid = document.getElementById('shortcutGrid');
        if (!grid) return;
        grid.innerHTML = '';
        
        shortcuts.forEach((text, i) => {
            const btn = document.createElement('button');
            btn.className = 'shortcut-btn';
            btn.innerText = text || '(空)';
            
            if (isEditMode) {
                btn.style.borderColor = '#ffaa00';
                btn.style.color = '#ffaa00';
            }
            
            btn.addEventListener('click', () => {
                if (isEditMode) {
                    const newText = prompt('ショートカット文を入力してください:', text);
                    if (newText !== null) {
                        shortcuts[i] = newText.trim();
                        localStorage.setItem('fallGraShortcuts', JSON.stringify(shortcuts));
                        renderShortcuts();
                    }
                } else {
                    if (text) {
                        window.sendChatMessage(text);
                    }
                }
            });
            grid.appendChild(btn);
        });
    }

    const editBtn = document.getElementById('editShortcutBtn');
    if (editBtn) {
        editBtn.addEventListener('click', () => {
            isEditMode = !isEditMode;
            editBtn.innerText = isEditMode ? '編集モード: ON' : '編集モード: OFF';
            editBtn.style.backgroundColor = isEditMode ? '#aa3333' : '#444';
            renderShortcuts();
        });
    }

    renderShortcuts();
};
