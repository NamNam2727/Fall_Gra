// =========================================================
// chat_system.js
// チャットUIの処理と送信イベントの管理
// =========================================================

// ログの追加処理
window.addLog = function(htmlText, type = 'sys') {
    const fullLogContent = document.getElementById('fullLogContent');
    if (!fullLogContent) return; 

    // システムログへ追加
    const fullLine = document.createElement('div');
    fullLine.className = `full-log-line log-type-${type}`;
    fullLine.innerHTML = htmlText;
    fullLogContent.appendChild(fullLine);
    fullLogContent.scrollTop = fullLogContent.scrollHeight; 

    // チャットログ(専用)へ追加
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

    // 画面中央のフローティングログへ追加
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

window.initChatSystem = function() {
    const chatSendBtn = document.getElementById('chatSendBtn');
    const chatInput = document.getElementById('chatInput');

    if (chatSendBtn && chatInput) {
        // Enterキーでも送信可能にする
        chatInput.addEventListener('keypress', function (e) {
            if (e.key === 'Enter') {
                chatSendBtn.click();
            }
        });

        chatSendBtn.addEventListener('click', (e) => {
            const text = chatInput.value.trim();
            if (text) {
                let myName = 'Player';
                if (window.GameState && window.GameState.userInfo && window.GameState.userInfo.name) {
                    myName = window.GameState.userInfo.name;
                }

                // ローカルのログに表示
                window.addLog(`<span style="color: #00ffff;">${myName}:</span> ${text}`, 'chat');
                
                // 自分のキャラクターの頭上に吹き出しを表示させる
                if (window.player && typeof window.showChatBubble === 'function') {
                    window.showChatBubble(window.player, text);
                }
                
                // マルチプレイ時、他プレイヤーにチャットを送信
                if (window.MultiplayerManager && typeof window.MultiplayerManager.sendData === 'function') {
                    window.MultiplayerManager.sendData({
                        type: 'chat', // 通信タイプをチャットに指定
                        senderName: myName,
                        text: text
                    });
                }

                chatInput.value = ''; // 入力欄をクリア
            }
        });
    }
};
