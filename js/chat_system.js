// =========================================================
// chat_system.js
// チャットUI、フローティングログ、ショートカット機能を管理
// =========================================================

window.addLog = function(htmlText, type = 'sys') {
    // 1. チャットログ(専用)へ追加
    if (type === 'chat') {
        const chatLogContent = document.getElementById('chatLogContent');
        if (chatLogContent) {
            const chatLine = document.createElement('div');
            chatLine.className = `full-log-line log-type-${type}`;
            chatLine.innerHTML = htmlText;
            chatLogContent.appendChild(chatLine);
            chatLogContent.scrollTop = chatLogContent.scrollHeight;
        }
    }

    // ★ 2. チャットタブが開いているか確認
    const chatTabBtn = document.querySelector('.bottom-tab-btn[data-target="chat"]');
    const isChatActive = chatTabBtn && chatTabBtn.classList.contains('active');
    
    // チャットタブが開いている時は、上に被るフローティングログは表示しない
    if (isChatActive) {
        return; 
    }

    // 3. 画面中央のフローティングログへ追加
    const floatingLog = document.getElementById('floatingLog');
    if (!floatingLog) return;
    
    const floatLine = document.createElement('div');
    floatLine.className = `log-line log-type-${type}`;
    floatLine.innerHTML = htmlText;
    floatingLog.appendChild(floatLine);

    // 5秒後にフェードアウトして消す
    const removeFloatLine = () => {
        if(!floatLine.classList.contains('fade-out')) {
            floatLine.classList.add('fade-out');
            setTimeout(() => { if (floatLine.parentNode) floatLine.remove(); }, 500); 
        }
    };
    floatLine.timerId = setTimeout(removeFloatLine, 5000);

    // 古いログを押し出す（最大5行）
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

// ==========================================
// チャット発信の共通処理（テキスト入力＆ショートカットから呼ばれる）
// ==========================================
window.sendChatMessage = function(text) {
    if (!text) return;
    
    let myName = 'Player';
    if (window.GameState && window.GameState.userInfo && window.GameState.userInfo.name) {
        myName = window.GameState.userInfo.name;
    }

    // 1. ローカルのログに表示
    window.addLog(`<span style="color: #00ffff;">${myName}:</span> ${text}`, 'chat');
    
    // 2. 自分のキャラクターの頭上に吹き出しを表示させる (player.js の関数を呼び出し)
    if (window.player && typeof window.showChatBubble === 'function') {
        window.showChatBubble(window.player, text);
    }
    
    // 3. マルチプレイ時、他プレイヤーにチャットを送信
    if (window.MultiplayerManager && typeof window.MultiplayerManager.sendData === 'function') {
        window.MultiplayerManager.sendData({
            type: 'chat',
            senderName: myName,
            text: text
        });
    }
};

window.initChatSystem = function() {
    // === 手入力チャットの登録 ===
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

    // === ★ショートカット機能の登録 ===
    let shortcuts = JSON.parse(localStorage.getItem('fallGraShortcuts')) || [
        "こんにちは！", "よろしく！", "ありがとう", "ごめん！", "助けて！", "お疲れ様！"
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
            
            // 編集モード時の見た目変更
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
