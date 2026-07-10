// =====================================
// htp_communication.js
// あそびかた：4. コミュニケーション (チャット)
// サブフォルダ (htp_pages) から動的に読み込まれます
// =====================================

window.HTP_Communication = {
    modeIdx: 0,
    modes: ['chat'], 

    // UI要素の参照
    chatArea: null,
    tabToggle: null,
    tabChat: null,
    flog: null,
    finger: null,

    init: function(container, htpManager) {
        // --- デモ空間専用のCSS ---
        const style = document.createElement('style');
        style.innerHTML = `
            .htp-sub-panel { display: none; flex-direction: column; flex: 1; }
            .htp-sub-panel.active { display: flex; }
            
            /* チャットUIデモ用スタイル */
            .htp-demo-chat-container {
                position: absolute; left: 10px; bottom: 10px; width: 220px; z-index: 20; 
                display: flex; flex-direction: column; justify-content: flex-end; font-family: sans-serif;
            }
            .htp-demo-floating-log {
                width: 100%; height: 80px; pointer-events: none; display: flex; flex-direction: column; 
                justify-content: flex-end; overflow: hidden; margin-bottom: 5px;
            }
            .htp-demo-log-line {
                font-size: 11px; line-height: 1.4; color: white; 
                text-shadow: 1px 1px 2px black, -1px -1px 2px black, 1px -1px 2px black, -1px 1px 2px black; 
                font-weight: bold; opacity: 1; transition: opacity 0.5s ease-out; margin-top: 2px;
            }
            .htp-demo-bottom-tabs { display: flex; pointer-events: none; }
            .htp-demo-tab-btn { 
                background-color: rgba(40, 40, 40, 0.9); border: 2px solid #555; border-bottom: none; 
                color: #ccc; font-size: 11px; padding: 4px 10px; border-radius: 6px 6px 0 0; 
                font-weight: bold; margin-right: -1px; 
            }
            .htp-demo-tab-btn.active { background-color: rgba(20, 20, 20, 0.85); color: #fff; border-color: #777; z-index: 2; }
            
            .htp-demo-chat-area {
                height: 100px; background-color: rgba(20, 20, 20, 0.85); border: 2px solid #777; 
                border-bottom: none; border-radius: 0 6px 0 0; display: flex; flex-direction: column; overflow: hidden;
            }
            .htp-demo-chat-content { padding: 4px; font-size: 11px; color: #ddd; display: flex; flex-direction: column; gap: 4px; }
            .htp-demo-chat-input { display: flex; margin-top: auto; padding: 4px; border-top: 1px solid #555; }
            .htp-demo-chat-input div { background: #111; color: #aaa; flex: 1; padding: 4px; border-radius: 4px; font-size: 10px; }
        `;
        container.appendChild(style);

        // UIのDOM構造を生成
        container.innerHTML += `
            <div class="htp-demo-area" style="position: relative;">
                <div id="htp-demo-canvas-container"></div>
                
                <!-- デモ用チャットUI -->
                <div class="htp-demo-chat-container">
                    <div class="htp-demo-floating-log" id="htp-demo-flog"></div>
                    <div class="htp-demo-bottom-tabs">
                        <div class="htp-demo-tab-btn active" id="htp-demo-tab-chat">チャット</div>
                        <div class="htp-demo-tab-btn">ショートカット</div>
                        <div class="htp-demo-tab-btn" id="htp-demo-tab-toggle" style="margin-left: auto; background-color: #333; color: white;">▼</div>
                    </div>
                    <div class="htp-demo-chat-area" id="htp-demo-chat-area">
                        <div class="htp-demo-chat-content">
                            <div><span style="color:#00ffff;">System:</span> ゲームが開始されました！</div>
                            <div><span style="color:#00ffff;">Player2:</span> よろしく！</div>
                        </div>
                        <div class="htp-demo-chat-input">
                            <div>発言...</div>
                        </div>
                    </div>
                </div>

                <!-- 汎用 指アイコン -->
                <div class="htp-demo-finger" id="htp-demo-finger-ui" style="position: absolute; z-index: 30; font-size: 32px; transition: opacity 0.2s; opacity: 0; pointer-events: none;">👆</div>
            </div>
            
            <!-- 1. チャットパネル -->
            <div id="htp-panel-chat" class="htp-sub-panel active">
                <div class="htp-desc-area">
                    <div class="htp-desc-title">チャットについて</div>
                    <div>
                        画面左下のチャットタブ、または「▼/▲」ボタンをスワイプ（ドラッグ）することで、チャットウィンドウのサイズを自由に変更できます。<br><br>
                        「▼」ボタンをタップするとウィンドウを閉じることができ、「▲」をタップすると元のサイズに戻ります。<br><br>
                        <span style="color:#00ffff; font-weight:bold;">チャットを閉じている間に新しいメッセージが届くと、タブの上に5秒間メッセージ（フローティングログ）が表示されます。</span>
                    </div>
                </div>
                <div class="htp-page-footer">
                    <div></div> <!-- 左寄せ用ダミー -->
                    <button class="htp-nav-btn" onclick="alert('次回実装予定です')">ショートカットについて ▶</button>
                </div>
            </div>
        `;

        this.chatArea = document.getElementById('htp-demo-chat-area');
        this.tabToggle = document.getElementById('htp-demo-tab-toggle');
        this.tabChat = document.getElementById('htp-demo-tab-chat');
        this.flog = document.getElementById('htp-demo-flog');
        this.finger = document.getElementById('htp-demo-finger-ui');

        this.switchMode(0, htpManager);
        htpManager.startDemo();
    },

    changeMode: function(dir) {
        let newIdx = this.modeIdx + dir;
        if (newIdx >= 0 && newIdx < this.modes.length) {
            this.switchMode(newIdx, window.HowToPlay);
        }
    },

    switchMode: function(idx, htpManager) {
        this.modeIdx = idx;
        const mode = this.modes[idx];

        document.querySelectorAll('.htp-sub-panel').forEach(p => p.classList.remove('active'));
        document.getElementById(`htp-panel-${mode}`).classList.add('active');

        // 3D空間の初期化 (常に正面を向かせて固定)
        htpManager.demo.context.moveVector.set(0, 0);
        const targetAngle = Math.PI; 
        const rotQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), targetAngle);
        htpManager.demo.player.quaternion.copy(rotQuat);
        htpManager.demo.context.currentFacingAngle = targetAngle;
        
        htpManager.demo.context.cameraAngle = 0;
        htpManager.demo.context.cameraDistance = 8;
        htpManager.demo.context.cameraHeight = 5;
        htpManager.demo.player.position.set(0, 20, 0); 
    },

    updateScenario: function(time, delta, demo) {
        // キャラクターとカメラは静止
        demo.context.moveVector.set(0, 0);
        const targetAngle = Math.PI; 
        const rotQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), targetAngle);
        demo.player.quaternion.slerp(rotQuat, 6 * delta);
        demo.context.currentFacingAngle = targetAngle;

        // --- チャットUIアニメーションシナリオ (12秒周期) ---
        const cycle = time % 12.0;

        if (cycle < 0.1) {
            // 初期状態リセット
            this.chatArea.style.height = '100px';
            this.chatArea.style.borderWidth = '2px';
            this.tabToggle.innerText = '▼';
            this.flog.innerHTML = '';
            
            this.finger.style.opacity = '0';
            this.finger.style.transition = 'none'; // リセット時はワープ
            this.finger.style.top = '100px';
            this.finger.style.left = '100px';
            this.finger.style.transform = 'scale(1.1)';
        }
        else if (cycle >= 0.5 && cycle < 1.5) {
            this.finger.style.transition = 'left 0.5s ease-out, top 0.5s ease-out, transform 0.1s, opacity 0.2s';
            this.finger.style.opacity = '1';
            // 指をチャットタブへ移動
            this.finger.style.top = '65px';
            this.finger.style.left = '35px';
        }
        else if (cycle >= 1.5 && cycle < 1.7) {
            this.finger.style.transform = 'scale(0.9)'; // つかむ
        }
        else if (cycle >= 1.7 && cycle < 3.5) {
            // 上下にスワイプ
            let h = 100;
            let topPos = 65;
            if (cycle < 2.3) {
                // 上に引っ張る
                let p = (cycle - 1.7) / 0.6;
                h = 100 + p * 40;
                topPos = 65 - p * 40;
            } else if (cycle < 2.9) {
                // 下に引っ張る
                let p = (cycle - 2.3) / 0.6;
                h = 140 - p * 80;
                topPos = 25 + p * 80;
            } else {
                // 上に戻す
                let p = (cycle - 2.9) / 0.6;
                h = 60 + p * 40;
                topPos = 105 - p * 40;
            }
            this.chatArea.style.transition = 'none';
            this.chatArea.style.height = h + 'px';
            this.finger.style.transition = 'none';
            this.finger.style.top = topPos + 'px';
        }
        else if (cycle >= 3.5 && cycle < 4.0) {
            this.finger.style.transform = 'scale(1.1)'; // はなす
            this.finger.style.transition = 'left 0.4s ease-out, top 0.4s ease-out, transform 0.1s, opacity 0.2s';
            // ▼ボタンへ移動
            this.finger.style.top = '65px';
            this.finger.style.left = '200px';
        }
        else if (cycle >= 4.0 && cycle < 4.2) {
            this.finger.style.transform = 'scale(0.9)'; // タップ
        }
        else if (cycle >= 4.2 && cycle < 5.0) {
            this.finger.style.transform = 'scale(1.1)';
            this.finger.style.opacity = '0'; // 引っ込む
            
            // チャットを閉じる
            this.chatArea.style.transition = 'height 0.3s, border-width 0.3s';
            this.chatArea.style.height = '0px';
            this.chatArea.style.borderWidth = '0px';
            this.tabToggle.innerText = '▲';
        }
        else if (cycle >= 5.5 && cycle < 5.6) {
            // メッセージ受信1
            if (this.flog.children.length === 0) {
                const div = document.createElement('div');
                div.className = 'htp-demo-log-line';
                div.innerHTML = '<span style="color:#00ffff;">Player3:</span> こっちだよ！';
                this.flog.appendChild(div);
            }
        }
        else if (cycle >= 6.5 && cycle < 6.6) {
            // メッセージ受信2
            if (this.flog.children.length === 1) {
                const div = document.createElement('div');
                div.className = 'htp-demo-log-line';
                div.innerHTML = '<span style="color:#00ffff;">Player4:</span> ありがとう';
                this.flog.appendChild(div);
            }
        }
        else if (cycle >= 8.5 && cycle < 9.0) {
            this.finger.style.transition = 'left 0.4s ease-out, top 0.4s ease-out, transform 0.1s, opacity 0.2s';
            this.finger.style.top = '170px'; // 閉じている時のタブの高さ
            this.finger.style.left = '200px';
            this.finger.style.opacity = '1';
        }
        else if (cycle >= 9.0 && cycle < 9.2) {
            this.finger.style.transform = 'scale(0.9)'; // タップ
        }
        else if (cycle >= 9.2 && cycle < 10.0) {
            this.finger.style.transform = 'scale(1.1)';
            this.finger.style.opacity = '0'; 
            
            // チャットを再び開く
            this.chatArea.style.height = '100px';
            this.chatArea.style.borderWidth = '2px';
            this.tabToggle.innerText = '▼';
        }
        else if (cycle >= 10.5 && cycle < 11.5) {
            // メッセージが時間経過でフェードアウトする演出
            Array.from(this.flog.children).forEach(child => {
                child.style.opacity = '0';
            });
        }
    },

    onWarp: function(warpX, warpZ) {
        // UIアニメーションのみのため、3Dオブジェクトのワープ処理は不要
    },

    cleanup: function(htpManager) {
        this.chatArea = null;
        this.tabToggle = null;
        this.tabChat = null;
        this.flog = null;
        this.finger = null;
    }
};

