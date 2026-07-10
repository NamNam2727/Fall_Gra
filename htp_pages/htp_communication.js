// =====================================
// htp_communication.js
// あそびかた：4. コミュニケーション (チャット、ショートカット、メンバーリスト)
// サブフォルダ (htp_pages) から動的に読み込まれます
// =====================================

window.HTP_Communication = {
    modeIdx: 0,
    modes: ['chat', 'shortcut', 'member'], 

    // UI要素の参照
    chatArea: null,
    tabToggle: null,
    tabChat: null,
    tabShortcut: null,
    contentChat: null,
    contentShortcut: null,
    flog: null,
    finger: null,
    
    scBtn1: null,
    scBtns: [],
    editBtn: null,
    chatContentArea: null,
    
    memberBtn: null,
    memberWindow: null,
    memberCopyBtn: null,
    memberCloseBtn: null,

    init: function(container, htpManager) {
        // --- デモ空間専用のCSS ---
        const style = document.createElement('style');
        style.innerHTML = `
            .htp-sub-panel { display: none; flex-direction: column; flex: 1; }
            .htp-sub-panel.active { display: flex; }
            
            /* チャット・ショートカットUIデモ用スタイル */
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
                font-weight: bold; margin-right: -1px; transition: background 0.2s;
            }
            .htp-demo-tab-btn.active { background-color: rgba(20, 20, 20, 0.85); color: #fff; border-color: #777; z-index: 2; }
            
            .htp-demo-chat-area {
                height: 100px; background-color: rgba(20, 20, 20, 0.85); border: 2px solid #777; 
                border-bottom: none; border-radius: 0 6px 0 0; display: flex; flex-direction: column; overflow: hidden;
            }
            .htp-demo-bottom-content { flex: 1; display: none; flex-direction: column; padding: 4px; overflow: hidden; }
            .htp-demo-bottom-content.active { display: flex; }
            
            .htp-demo-chat-content { flex: 1; font-size: 11px; color: #ddd; display: flex; flex-direction: column; gap: 4px; overflow: hidden; }
            .htp-demo-chat-input { display: flex; margin-top: auto; border-top: 1px solid #555; padding-top: 4px; }
            .htp-demo-chat-input div:first-child { background: rgba(0,0,0,0.5); color: #aaa; flex: 1; padding: 4px; border-radius: 4px 0 0 4px; font-size: 10px; border: 1px solid #555; }
            .htp-demo-chat-input div:last-child { background: #4CAF50; color: white; padding: 4px 10px; border-radius: 0 4px 4px 0; font-size: 10px; font-weight: bold; display: flex; align-items: center; justify-content: center; }
            
            .htp-demo-sc-btn { background: rgba(0,0,0,0.6); border: 1px solid #666; color: white; border-radius: 4px; font-size: 10px; display: flex; align-items: center; justify-content: center; font-weight: bold; padding: 4px; transition: all 0.1s; }
            .htp-demo-sc-btn.edit { border-color: #ffaa00; color: #ffaa00; }
        `;
        container.appendChild(style);

        // UIのDOM構造を生成
        container.innerHTML += `
            <div class="htp-demo-area" style="position: relative;">
                <div id="htp-demo-canvas-container"></div>
                
                <!-- デモ用チャット・ショートカットUI -->
                <div class="htp-demo-chat-container">
                    <div class="htp-demo-floating-log" id="htp-demo-flog"></div>
                    <div class="htp-demo-bottom-tabs">
                        <div class="htp-demo-tab-btn active" id="htp-demo-tab-chat">チャット</div>
                        <div class="htp-demo-tab-btn" id="htp-demo-tab-shortcut">ショートカット</div>
                        <div class="htp-demo-tab-btn" id="htp-demo-tab-toggle" style="margin-left: auto; background-color: #333; color: white;">▼</div>
                    </div>
                    <div class="htp-demo-chat-area" id="htp-demo-chat-area">
                        <!-- チャット用画面 -->
                        <div id="htp-demo-content-chat" class="htp-demo-bottom-content active">
                            <div class="htp-demo-chat-content" id="htp-demo-chat-content-log">
                                <div><span style="color:#00ffff;">System:</span> ゲームが開始されました！</div>
                            </div>
                            <div class="htp-demo-chat-input">
                                <div>発言...</div>
                                <div>送信</div>
                            </div>
                        </div>
                        <!-- ショートカット用画面 -->
                        <div id="htp-demo-content-shortcut" class="htp-demo-bottom-content">
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; padding: 2px; flex: 1; overflow: hidden;">
                                <div class="htp-demo-sc-btn" id="htp-demo-sc-btn1">こんにちは！</div>
                                <div class="htp-demo-sc-btn">よろしく！</div>
                                <div class="htp-demo-sc-btn">ありがとう</div>
                                <div class="htp-demo-sc-btn">ごめん！</div>
                            </div>
                            <div id="htp-demo-edit-sc-btn" style="background: #444; color: white; text-align: center; padding: 4px; font-size: 10px; font-weight: bold; border-radius: 4px;">編集モード: OFF</div>
                        </div>
                    </div>
                </div>

                <!-- メンバーリストボタン -->
                <div id="htp-demo-member-btn" style="display:none; position: absolute; bottom: 80px; right: -2px; padding: 6px 10px 6px 12px; background-color: #fce4b2; border: 2px solid #000; border-radius: 10px 0 0 10px; color: #000; font-size: 11px; font-weight: bold; box-shadow: -2px 2px 5px rgba(0,0,0,0.2); z-index: 10;">メンバーリスト</div>

                <!-- メンバーリストウィンドウ -->
                <div id="htp-demo-member-window" style="display:none; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 80%; max-width: 250px; background: rgba(20, 20, 30, 0.95); border: 2px solid rgba(255, 255, 255, 0.8); border-radius: 8px; z-index: 20; flex-direction: column; box-shadow: 0 5px 15px rgba(0,0,0,0.5); font-family: sans-serif;">
                    <div style="padding: 8px 10px 0 10px; display: flex; justify-content: space-between; align-items: center; font-size: 11px; font-weight: bold; color: #00ffff;">
                        <span>ルームID: ----</span>
                        <div id="htp-demo-member-copy" style="background: #4CAF50; color: white; padding: 4px 8px; border-radius: 4px; transition: background 0.1s;">コピー</div>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 10px; border-bottom: 1px solid rgba(255,255,255,0.2); font-size: 13px; font-weight: bold; color: white;">
                        <span>ルームメンバー</span><span id="htp-demo-member-close">❌</span>
                    </div>
                    <div style="padding: 8px; display: flex; flex-direction: column; gap: 6px;">
                        <div style="display: flex; align-items: center; background: rgba(255,255,255,0.1); padding: 6px; border-radius: 6px;">
                            <div style="width: 24px; height: 24px; border-radius: 50%; background: #ffaa00; margin-right: 10px; display: flex; justify-content: center; align-items: center; font-size: 12px;">👤</div>
                            <div style="color: white; font-size: 12px; font-weight: bold; flex: 1;">Player1</div>
                        </div>
                        <div style="display: flex; align-items: center; background: rgba(255,255,255,0.1); padding: 6px; border-radius: 6px;">
                            <div style="width: 24px; height: 24px; border-radius: 50%; background: #ccc; margin-right: 10px; display: flex; justify-content: center; align-items: center; font-size: 12px;">👤</div>
                            <div style="color: white; font-size: 12px; font-weight: bold; flex: 1;">Player2</div>
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
                    <button class="htp-nav-btn" onclick="HTP_Communication.changeMode(1)">ショートカットについて ▶</button>
                </div>
            </div>

            <!-- 2. ショートカットパネル -->
            <div id="htp-panel-shortcut" class="htp-sub-panel">
                <div class="htp-desc-area">
                    <div class="htp-desc-title">ショートカット</div>
                    <div>
                        「ショートカット」タブに切り替えると、定型文のリストが表示されます。<br>
                        リスト内のメッセージをタップするだけで、すばやくチャットに送信できます。<br><br>
                        <span style="color:#ffaa00; font-weight:bold;">「編集モード」をONにしてメッセージをタップすると、好きな言葉に書き換えることができます！</span>
                    </div>
                </div>
                <div class="htp-page-footer">
                    <button class="htp-nav-btn back" onclick="HTP_Communication.changeMode(-1)">◀ まえへ</button>
                    <button class="htp-nav-btn" onclick="HTP_Communication.changeMode(1)">メンバーリストについて ▶</button>
                </div>
            </div>

            <!-- 3. メンバーパネル -->
            <div id="htp-panel-member" class="htp-sub-panel">
                <div class="htp-desc-area">
                    <div class="htp-desc-title">メンバーリスト</div>
                    <div>
                        画面右側の「メンバーリスト」ボタンをタップすると、現在同じ部屋にいるプレイヤーの一覧と状態を確認できます。<br><br>
                        <span style="color:#00ffff; font-weight:bold;">タイトルバーにある「ルームID」の横のコピーボタンをタップしてIDを共有することで、他の人を自分のルームに招待することができます。</span>
                    </div>
                </div>
                <div class="htp-page-footer">
                    <button class="htp-nav-btn back" onclick="HTP_Communication.changeMode(-1)">◀ まえへ</button>
                    <div></div>
                </div>
            </div>
        `;

        this.chatArea = document.getElementById('htp-demo-chat-area');
        this.tabToggle = document.getElementById('htp-demo-tab-toggle');
        this.tabChat = document.getElementById('htp-demo-tab-chat');
        this.tabShortcut = document.getElementById('htp-demo-tab-shortcut');
        this.contentChat = document.getElementById('htp-demo-content-chat');
        this.contentShortcut = document.getElementById('htp-demo-content-shortcut');
        this.flog = document.getElementById('htp-demo-flog');
        this.finger = document.getElementById('htp-demo-finger-ui');
        
        this.scBtn1 = document.getElementById('htp-demo-sc-btn1');
        this.scBtns = document.querySelectorAll('.htp-demo-sc-btn');
        this.editBtn = document.getElementById('htp-demo-edit-sc-btn');
        this.chatContentArea = document.getElementById('htp-demo-chat-content-log');

        this.memberBtn = document.getElementById('htp-demo-member-btn');
        this.memberWindow = document.getElementById('htp-demo-member-window');
        this.memberCopyBtn = document.getElementById('htp-demo-member-copy');
        this.memberCloseBtn = document.getElementById('htp-demo-member-close');

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
        
        // UIの初期化
        this.chatArea.style.height = '100px';
        this.chatArea.style.borderWidth = '2px';
        this.tabToggle.innerText = '▼';
        this.flog.innerHTML = '';
        this.chatContentArea.innerHTML = '<div><span style="color:#00ffff;">System:</span> ゲームが開始されました！</div>';
        
        this.tabChat.classList.add('active');
        this.tabShortcut.classList.remove('active');
        this.contentChat.classList.add('active');
        this.contentShortcut.classList.remove('active');
        
        this.scBtn1.innerText = 'こんにちは！';
        this.scBtns.forEach(btn => btn.classList.remove('edit'));
        this.editBtn.innerText = '編集モード: OFF';
        this.editBtn.style.background = '#444';
        
        this.memberBtn.style.display = mode === 'member' ? 'flex' : 'none';
        this.memberWindow.style.display = 'none';
        this.memberCopyBtn.innerText = 'コピー';
        this.memberCopyBtn.style.background = '#4CAF50';
        this.memberCopyBtn.style.color = 'white';
        
        this.finger.style.transition = 'none';
        this.finger.style.opacity = '0';
        this.finger.style.transform = 'scale(1.1)';
        this.finger.style.top = '100px';
        this.finger.style.left = '100px';
    },

    updateScenario: function(time, delta, demo) {
        // キャラクターとカメラは静止
        demo.context.moveVector.set(0, 0);
        const targetAngle = Math.PI; 
        const rotQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), targetAngle);
        demo.player.quaternion.slerp(rotQuat, 6 * delta);
        demo.context.currentFacingAngle = targetAngle;

        const mode = this.modes[this.modeIdx];
        if (mode === 'chat') this.updateChat(time, delta);
        else if (mode === 'shortcut') this.updateShortcut(time, delta);
        else if (mode === 'member') this.updateMember(time, delta);
    },

    // ------------------------------------------
    // シナリオ1：チャットの開閉とリサイズ
    // ------------------------------------------
    updateChat: function(time, delta) {
        const cycle = time % 12.0;

        if (cycle < 0.1) {
            this.chatArea.style.height = '100px';
            this.chatArea.style.borderWidth = '2px';
            this.tabToggle.innerText = '▼';
            this.flog.innerHTML = '';
            
            this.finger.style.opacity = '0';
            this.finger.style.transition = 'none'; 
            this.finger.style.top = '100px';
            this.finger.style.left = '100px';
            this.finger.style.transform = 'scale(1.1)';
        }
        else if (cycle >= 0.5 && cycle < 1.5) {
            this.finger.style.transition = 'left 0.5s ease-out, top 0.5s ease-out, transform 0.1s, opacity 0.2s';
            this.finger.style.opacity = '1';
            this.finger.style.top = '65px';
            this.finger.style.left = '35px';
        }
        else if (cycle >= 1.5 && cycle < 1.7) {
            this.finger.style.transform = 'scale(0.9)'; // つかむ
        }
        else if (cycle >= 1.7 && cycle < 3.5) {
            // 上下にスワイプ
            let h = 100; let topPos = 65;
            if (cycle < 2.3) {
                let p = (cycle - 1.7) / 0.6;
                h = 100 + p * 40; topPos = 65 - p * 40;
            } else if (cycle < 2.9) {
                let p = (cycle - 2.3) / 0.6;
                h = 140 - p * 80; topPos = 25 + p * 80;
            } else {
                let p = (cycle - 2.9) / 0.6;
                h = 60 + p * 40; topPos = 105 - p * 40;
            }
            this.chatArea.style.transition = 'none';
            this.chatArea.style.height = h + 'px';
            this.finger.style.transition = 'none';
            this.finger.style.top = topPos + 'px';
        }
        else if (cycle >= 3.5 && cycle < 4.0) {
            this.finger.style.transform = 'scale(1.1)'; // はなす
            this.finger.style.transition = 'left 0.4s ease-out, top 0.4s ease-out, transform 0.1s, opacity 0.2s';
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
            if (this.flog.children.length === 0) {
                const div = document.createElement('div');
                div.className = 'htp-demo-log-line';
                div.innerHTML = '<span style="color:#00ffff;">Player3:</span> こっちだよ！';
                this.flog.appendChild(div);
            }
        }
        else if (cycle >= 6.5 && cycle < 6.6) {
            if (this.flog.children.length === 1) {
                const div = document.createElement('div');
                div.className = 'htp-demo-log-line';
                div.innerHTML = '<span style="color:#00ffff;">Player4:</span> ありがとう';
                this.flog.appendChild(div);
            }
        }
        else if (cycle >= 8.5 && cycle < 9.0) {
            this.finger.style.transition = 'left 0.4s ease-out, top 0.4s ease-out, transform 0.1s, opacity 0.2s';
            this.finger.style.top = '170px'; 
            this.finger.style.left = '200px';
            this.finger.style.opacity = '1';
        }
        else if (cycle >= 9.0 && cycle < 9.2) {
            this.finger.style.transform = 'scale(0.9)'; // タップ
        }
        else if (cycle >= 9.2 && cycle < 10.0) {
            this.finger.style.transform = 'scale(1.1)';
            this.finger.style.opacity = '0'; 
            
            this.chatArea.style.height = '100px';
            this.chatArea.style.borderWidth = '2px';
            this.tabToggle.innerText = '▼';
        }
        else if (cycle >= 10.5 && cycle < 11.5) {
            Array.from(this.flog.children).forEach(child => { child.style.opacity = '0'; });
        }
    },

    // ------------------------------------------
    // シナリオ2：ショートカットと編集モード
    // ------------------------------------------
    updateShortcut: function(time, delta) {
        const cycle = time % 10.0;

        if (cycle < 0.1) {
            this.chatContentArea.innerHTML = '<div><span style="color:#00ffff;">System:</span> ゲームが開始されました！</div>';
            this.tabChat.classList.add('active');
            this.tabShortcut.classList.remove('active');
            this.contentChat.classList.add('active');
            this.contentShortcut.classList.remove('active');
            
            this.scBtn1.innerText = 'こんにちは！';
            this.scBtns.forEach(btn => btn.classList.remove('edit'));
            this.editBtn.innerText = '編集モード: OFF';
            this.editBtn.style.background = '#444';

            this.finger.style.opacity = '0';
            this.finger.style.transition = 'none'; 
            this.finger.style.top = '100px';
            this.finger.style.left = '50%';
            this.finger.style.transform = 'scale(1.1)';
        }
        else if (cycle >= 0.5 && cycle < 1.0) {
            this.finger.style.transition = 'left 0.4s ease-out, top 0.4s ease-out, transform 0.1s, opacity 0.2s';
            this.finger.style.opacity = '1';
            this.finger.style.top = '65px';
            this.finger.style.left = '120px'; // ショートカットタブ
        }
        else if (cycle >= 1.0 && cycle < 1.2) {
            this.finger.style.transform = 'scale(0.9)';
        }
        else if (cycle >= 1.2 && cycle < 1.8) {
            this.finger.style.transform = 'scale(1.1)';
            this.tabChat.classList.remove('active');
            this.tabShortcut.classList.add('active');
            this.contentChat.classList.remove('active');
            this.contentShortcut.classList.add('active');
            
            this.finger.style.top = '100px';
            this.finger.style.left = '60px'; // 左上のボタン
        }
        else if (cycle >= 1.8 && cycle < 2.0) {
            this.finger.style.transform = 'scale(0.9)';
            this.scBtn1.style.transform = 'scale(0.95)';
        }
        else if (cycle >= 2.0 && cycle < 2.8) {
            this.finger.style.transform = 'scale(1.1)';
            this.scBtn1.style.transform = 'scale(1)';
            
            // チャットログにメッセージ追加
            if (this.chatContentArea.children.length === 1) {
                this.chatContentArea.innerHTML += '<div><span style="color:#00ffff;">Player:</span> こんにちは！</div>';
            }
            
            this.finger.style.top = '175px';
            this.finger.style.left = '110px'; // 編集モードボタン
        }
        else if (cycle >= 2.8 && cycle < 3.0) {
            this.finger.style.transform = 'scale(0.9)';
        }
        else if (cycle >= 3.0 && cycle < 3.8) {
            this.finger.style.transform = 'scale(1.1)';
            this.editBtn.innerText = '編集モード: ON';
            this.editBtn.style.background = '#aa3333';
            this.scBtns.forEach(btn => btn.classList.add('edit'));
            
            this.finger.style.top = '100px';
            this.finger.style.left = '60px'; // 再び左上のボタン
        }
        else if (cycle >= 3.8 && cycle < 4.0) {
            this.finger.style.transform = 'scale(0.9)';
            this.scBtn1.style.transform = 'scale(0.95)';
        }
        else if (cycle >= 4.0 && cycle < 4.8) {
            this.finger.style.transform = 'scale(1.1)';
            this.scBtn1.style.transform = 'scale(1)';
            
            // プロンプトを模した文字の書き換え演出
            this.scBtn1.innerText = 'ヤッホー！';
            
            this.finger.style.top = '175px';
            this.finger.style.left = '110px'; // 再び編集モードボタン
        }
        else if (cycle >= 4.8 && cycle < 5.0) {
            this.finger.style.transform = 'scale(0.9)';
        }
        else if (cycle >= 5.0 && cycle < 5.8) {
            this.finger.style.transform = 'scale(1.1)';
            this.editBtn.innerText = '編集モード: OFF';
            this.editBtn.style.background = '#444';
            this.scBtns.forEach(btn => btn.classList.remove('edit'));
            
            this.finger.style.top = '100px';
            this.finger.style.left = '60px'; // 書き換えたボタン
        }
        else if (cycle >= 5.8 && cycle < 6.0) {
            this.finger.style.transform = 'scale(0.9)';
            this.scBtn1.style.transform = 'scale(0.95)';
        }
        else if (cycle >= 6.0 && cycle < 7.0) {
            this.finger.style.transform = 'scale(1.1)';
            this.scBtn1.style.transform = 'scale(1)';
            
            // チャットログに新しいメッセージ追加
            if (this.chatContentArea.children.length === 2) {
                this.chatContentArea.innerHTML += '<div><span style="color:#00ffff;">Player:</span> ヤッホー！</div>';
            }
            
            this.finger.style.opacity = '0'; // 隠れる
        }
    },

    // ------------------------------------------
    // シナリオ3：メンバーリストとルームIDコピー
    // ------------------------------------------
    updateMember: function(time, delta) {
        const cycle = time % 8.0;

        if (cycle < 0.1) {
            this.memberWindow.style.display = 'none';
            this.memberCopyBtn.innerText = 'コピー';
            this.memberCopyBtn.style.background = '#4CAF50';
            this.memberCopyBtn.style.color = 'white';

            this.finger.style.opacity = '0';
            this.finger.style.transition = 'none'; 
            this.finger.style.top = '200px';
            this.finger.style.left = '50%';
            this.finger.style.transform = 'scale(1.1)';
        }
        else if (cycle >= 0.5 && cycle < 1.0) {
            this.finger.style.transition = 'left 0.4s ease-out, top 0.4s ease-out, transform 0.1s, opacity 0.2s';
            this.finger.style.opacity = '1';
            this.finger.style.top = '110px';
            this.finger.style.left = 'calc(100% - 60px)'; // メンバーボタン
        }
        else if (cycle >= 1.0 && cycle < 1.2) {
            this.finger.style.transform = 'scale(0.9)';
            this.memberBtn.style.transform = 'scale(0.95)';
        }
        else if (cycle >= 1.2 && cycle < 2.0) {
            this.finger.style.transform = 'scale(1.1)';
            this.memberBtn.style.transform = 'scale(1)';
            this.memberWindow.style.display = 'flex'; // ウィンドウ開く
            
            this.finger.style.top = '65px';
            this.finger.style.left = '70%'; // コピーボタン
        }
        else if (cycle >= 2.0 && cycle < 2.2) {
            this.finger.style.transform = 'scale(0.9)';
            this.memberCopyBtn.style.transform = 'scale(0.95)';
        }
        else if (cycle >= 2.2 && cycle < 4.0) {
            this.finger.style.transform = 'scale(1.1)';
            this.memberCopyBtn.style.transform = 'scale(1)';
            this.memberCopyBtn.innerText = 'コピー完了!';
            this.memberCopyBtn.style.background = '#ffaa00';
            this.memberCopyBtn.style.color = '#000';
            
            this.finger.style.top = '105px';
            this.finger.style.left = '70%'; // 閉じるボタン
        }
        else if (cycle >= 4.0 && cycle < 4.2) {
            this.finger.style.transform = 'scale(0.9)';
            this.memberCloseBtn.style.transform = 'scale(1.2)';
        }
        else if (cycle >= 4.2 && cycle < 5.0) {
            this.finger.style.transform = 'scale(1.1)';
            this.memberCloseBtn.style.transform = 'scale(1)';
            this.memberWindow.style.display = 'none'; // ウィンドウ閉じる
            
            this.finger.style.opacity = '0';
        }
    },

    cleanup: function(htpManager) {
        this.chatArea = null;
        this.tabToggle = null;
        this.tabChat = null;
        this.tabShortcut = null;
        this.contentChat = null;
        this.contentShortcut = null;
        this.flog = null;
        this.finger = null;
        
        this.scBtn1 = null;
        this.scBtns = null;
        this.editBtn = null;
        this.chatContentArea = null;
        
        this.memberBtn = null;
        this.memberWindow = null;
        this.memberCopyBtn = null;
        this.memberCloseBtn = null;
    }
};


