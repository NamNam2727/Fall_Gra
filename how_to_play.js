// =====================================
// how_to_play.js
// 「あそびかた」ウィンドウの生成とページ遷移の管理
// =====================================

window.HowToPlay = {
    initUI: function() {
        const style = document.createElement('style');
        style.innerHTML = `
            #how-to-play-btn { 
                position: absolute; right: 10px; 
                padding: 8px 16px; background: rgba(50, 150, 255, 0.85); 
                border: 2px solid rgba(255, 255, 255, 0.9); border-radius: 8px; 
                color: #fff; font-weight: bold; font-family: sans-serif; font-size: 14px; 
                box-shadow: 0 4px 10px rgba(0,0,0,0.4); pointer-events: auto; cursor: pointer; 
                text-shadow: 1px 1px 2px rgba(0,0,0,0.5); z-index: 100; 
                display: flex; justify-content: center; align-items: center; transition: all 0.2s; 
            }
            #how-to-play-btn:active { background: rgba(50, 150, 255, 1.0); transform: scale(0.95); }

            #htp-window {
                position: absolute; left: 50%; transform: translateX(-50%);
                width: 90%; max-width: 450px;
                background: rgba(15, 15, 25, 0.95); border: 3px solid #3296ff; border-radius: 12px;
                box-shadow: 0 10px 40px rgba(0,0,0,0.8); display: none; flex-direction: column;
                z-index: 2000; pointer-events: auto; font-family: sans-serif; color: white;
            }
            
            .htp-header {
                display: flex; justify-content: space-between; align-items: center;
                padding: 10px 15px; border-bottom: 2px solid rgba(255,255,255,0.2);
                font-size: 16px; font-weight: bold;
            }
            .htp-header-btn {
                background: none; border: none; color: white; font-size: 20px; cursor: pointer; padding: 0 5px; font-weight: bold;
            }
            
            .htp-content {
                flex: 1; overflow-y: auto; padding: 15px; display: flex; flex-direction: column; gap: 10px;
            }

            .htp-menu-btn {
                background: rgba(255,255,255,0.1); border: 2px solid rgba(255,255,255,0.3);
                padding: 15px; border-radius: 8px; color: white; font-size: 16px; font-weight: bold;
                text-align: left; cursor: pointer; transition: 0.2s; display: flex; align-items: center;
            }
            .htp-menu-btn::after {
                content: "▶"; margin-left: auto; color: #3296ff; font-size: 14px;
            }
            .htp-menu-btn:active {
                background: rgba(255,255,255,0.2); border-color: #3296ff; transform: scale(0.98);
            }
            
            .htp-page {
                display: none; flex-direction: column; gap: 10px; height: 100%;
            }
            .htp-page.active {
                display: flex;
            }

            /* --- 映像エリア（デモ）のCSS --- */
            .htp-demo-area {
                width: 100%; height: 200px;
                background: #87CEEB; /* 空色 */
                position: relative; border-radius: 8px; overflow: hidden;
                border: 2px solid #555; box-sizing: border-box; flex-shrink: 0;
            }
            .htp-demo-area::after {
                content: ''; position: absolute; bottom: 0; left: 0; width: 100%; height: 60%;
                background: #66cc66; /* 芝生 */ border-top: 2px solid #55aa55; z-index: 0;
            }
            
            /* UI模倣 */
            .htp-demo-jump {
                position: absolute; bottom: 10px; right: 15px; width: 50px; height: 50px;
                background: rgba(255, 255, 255, 0.5); border: 2px solid rgba(255, 255, 255, 0.8); 
                border-radius: 50%; color: #333; font-weight: bold; font-family: sans-serif; font-size: 11px;
                display: flex; justify-content: center; align-items: center;
                box-shadow: 0 2px 5px rgba(0,0,0,0.3); z-index: 10;
            }
            
            .htp-demo-joystick-base {
                position: absolute; bottom: 10px; left: 15px; width: 70px; height: 70px;
                border: 2px solid rgba(255, 255, 255, 0.6); border-radius: 50%; 
                background: radial-gradient(circle, rgba(255,255,255,0.1) 0%, rgba(0,0,0,0.3) 100%);
                z-index: 10;
            }
            .htp-demo-joystick-stick {
                position: absolute; top: 50%; left: 50%; width: 34px; height: 34px; 
                background: rgba(255, 255, 255, 0.9); border-radius: 50%; 
                box-shadow: 0 4px 8px rgba(0,0,0,0.4);
                animation: demoStickMove 8s infinite ease-in-out;
            }
            .htp-demo-arrow {
                position: absolute; top: 50%; left: 50%; width: 0; height: 0;
                border-left: 10px solid transparent; border-right: 10px solid transparent;
                border-bottom: 16px solid #ffcc00; margin-left: -10px; margin-top: -16px;
                transform-origin: 50% 100%; filter: drop-shadow(0 2px 2px rgba(0,0,0,0.5));
                animation: demoArrowMove 8s infinite;
            }
            .htp-demo-finger {
                position: absolute; top: 15px; left: 10px; font-size: 30px;
                filter: drop-shadow(2px 4px 2px rgba(0,0,0,0.5));
                animation: demoFingerTap 8s infinite;
            }

            /* キャラクター模倣 */
            .htp-demo-player {
                position: absolute; top: 50%; left: 50%; width: 40px; height: 40px;
                margin-top: -10px; margin-left: -20px; /* 少し下からスタート */
                background: #111; border-radius: 50%;
                display: flex; justify-content: center; align-items: center;
                box-shadow: 0 4px 5px rgba(0,0,0,0.5); z-index: 10;
                animation: demoPlayerMove 8s infinite ease-in-out;
            }
            .htp-demo-player-inner {
                width: 34px; height: 34px; background: #FFDD88; 
                border: 2px solid #FFAA00; border-radius: 50%;
                display: flex; justify-content: center; align-items: center;
                font-size: 18px; position: relative; box-sizing: border-box;
            }
            .htp-demo-player-dir {
                position: absolute; top: -4px; left: 50%; transform: translateX(-50%);
                width: 8px; height: 8px; background: #ff4400; border-radius: 50%;
            }

            /* --- デモ用のアニメーション --- */
            @keyframes demoStickMove {
                0%, 5%, 30%, 35%, 65%, 70%, 100% { transform: translate(-50%, -50%); }
                10%, 25% { transform: translate(-50%, -120%); } /* 前（上） */
                45%, 60% { transform: translate(30%, -100%); } /* 右斜め前 */
                80%, 95% { transform: translate(-100%, 30%); } /* 左斜め後ろ（戻る） */
            }
            @keyframes demoArrowMove {
                0%, 5%, 25%, 35%, 60%, 70%, 95%, 100% { opacity: 0; }
                10%, 20% { opacity: 1; transform: rotate(0deg) translateY(-25px); }
                45%, 55% { opacity: 1; transform: rotate(45deg) translateY(-25px); }
                80%, 90% { opacity: 1; transform: rotate(225deg) translateY(-25px); }
            }
            @keyframes demoFingerTap {
                0%, 5%, 30%, 35%, 65%, 70%, 100% { transform: scale(1.1) translateY(5px); }
                10%, 25%, 45%, 60%, 80%, 95% { transform: scale(1.0) translateY(0); }
            }
            @keyframes demoPlayerMove {
                0%, 10% { transform: translate(0px, 0px) rotate(0deg); }
                15% { transform: translate(0px, -20px) rotate(0deg); } /* 前へ */
                20%, 35% { transform: translate(0px, -40px) rotate(0deg); } 
                40% { transform: translate(0px, -40px) rotate(45deg); } /* 向きを右へ */
                45% { transform: translate(25px, -65px) rotate(45deg); } 
                55%, 70% { transform: translate(50px, -90px) rotate(45deg); } 
                75% { transform: translate(50px, -90px) rotate(-135deg); } /* 向きを左後ろへ */
                80% { transform: translate(25px, -45px) rotate(-135deg); } 
                90%, 95% { transform: translate(0px, 0px) rotate(-135deg); } 
                100% { transform: translate(0px, 0px) rotate(0deg); } /* 正面へリセット */
            }

            /* 説明テキストとナビゲーション */
            .htp-desc-area {
                flex: 1; overflow-y: auto; background: rgba(0,0,0,0.5);
                border-radius: 8px; padding: 12px; font-size: 14px; line-height: 1.6;
            }
            .htp-desc-title {
                color: #3296ff; font-weight: bold; font-size: 16px; margin-bottom: 8px;
                border-bottom: 1px solid #3296ff; padding-bottom: 5px;
            }
            .htp-page-footer {
                display: flex; justify-content: flex-end; margin-top: auto; padding-top: 10px;
            }
            .htp-nav-btn {
                background: #3296ff; color: white; border: none; padding: 8px 15px;
                border-radius: 6px; font-weight: bold; cursor: pointer; transition: 0.2s;
            }
            .htp-nav-btn:active { transform: scale(0.95); }
            
            .htp-temp-text { color: #aaa; text-align: center; margin-top: 20px; font-size: 14px; line-height: 1.5; }
        `;
        document.head.appendChild(style);

        const uiLayer = document.getElementById('ui-layer');
        if (!uiLayer) return;

        const screenHeight = window.innerHeight;
        const topExclusionHeight = screenHeight >= 812 ? 98 : 74; 
        
        const htpBtn = document.createElement('div');
        htpBtn.id = 'how-to-play-btn';
        htpBtn.innerText = 'あそびかた';
        htpBtn.style.top = (topExclusionHeight + 15 + 60) + 'px'; 
        uiLayer.appendChild(htpBtn);

        const htpWindow = document.createElement('div');
        htpWindow.id = 'htp-window';
        htpWindow.style.top = (topExclusionHeight + 15) + 'px';
        htpWindow.style.height = `calc(100% - ${topExclusionHeight + 15 + 20}px)`;
        
        htpWindow.innerHTML = `
            <div class="htp-header">
                <button class="htp-header-btn" id="htp-back-btn" style="visibility: hidden;">←</button>
                <span id="htp-title">あそびかた</span>
                <button class="htp-header-btn" id="htp-close-btn">❌</button>
            </div>
            <div class="htp-content" id="htp-content-area">
                
                <!-- ＝＝＝ 目次画面 ＝＝＝ -->
                <div id="htp-index" class="htp-page active">
                    <button class="htp-menu-btn" data-target="htp-page-basic">1. 基本操作</button>
                    <button class="htp-menu-btn" data-target="htp-page-item">2. アイテム</button>
                    <button class="htp-menu-btn" data-target="htp-page-minigame">3. ミニゲーム</button>
                    <button class="htp-menu-btn" data-target="htp-page-comm">4. コミュニケーション</button>
                </div>

                <!-- ＝＝＝ 1. 基本操作 (移動) ＝＝＝ -->
                <div id="htp-page-basic" class="htp-page">
                    <div class="htp-demo-area">
                        <div class="htp-demo-player">
                            <div class="htp-demo-player-inner">👤<div class="htp-demo-player-dir"></div></div>
                        </div>
                        <div class="htp-demo-joystick-base">
                            <div class="htp-demo-arrow"></div>
                            <div class="htp-demo-joystick-stick">
                                <div class="htp-demo-finger">👆</div>
                            </div>
                        </div>
                        <div class="htp-demo-jump">JUMP</div>
                    </div>
                    
                    <div class="htp-desc-area">
                        <div class="htp-desc-title">移動とカメラ</div>
                        <div>
                            画面の左側をドラッグ（指でなぞる）すると、ジョイスティックが現れます。<br>
                            動かしたい方向へ指をスライドさせると、キャラクターがその方向へ進みます。<br><br>
                            <span style="color:#ffcc00; font-weight:bold;">※カメラは自動で背後を追いかけるため、手動での視点操作は不要です！</span>
                        </div>
                    </div>
                    
                    <div class="htp-page-footer">
                        <button class="htp-nav-btn" data-target="htp-page-jump">つぎへ ▶</button>
                    </div>
                </div>

                <!-- ＝＝＝ 1. 基本操作 (ジャンプ) - 枠のみ ＝＝＝ -->
                <div id="htp-page-jump" class="htp-page">
                    <div class="htp-temp-text">ここにジャンプのデモと説明が入ります。<br>※次回実装</div>
                    <div class="htp-page-footer" style="justify-content: space-between;">
                        <button class="htp-nav-btn" data-target="htp-page-basic" style="background:#555;">◀ まえへ</button>
                    </div>
                </div>

                <!-- ＝＝＝ 他のページ（仮枠） ＝＝＝ -->
                <div id="htp-page-item" class="htp-page">
                    <div class="htp-temp-text">ここに「2. アイテム」<br>（ボム・羽・ネットの効果など）<br>の画像や説明が入ります。<br><br>※次回実装</div>
                </div>
                <div id="htp-page-minigame" class="htp-page">
                    <div class="htp-temp-text">ここに「3. ミニゲーム」<br>（開始方法・観戦モードなど）<br>の画像や説明が入ります。<br><br>※次回実装</div>
                </div>
                <div id="htp-page-comm" class="htp-page">
                    <div class="htp-temp-text">ここに「4. コミュニケーション」<br>（チャット・ルームIDコピーなど）<br>の画像や説明が入ります。<br><br>※次回実装</div>
                </div>

            </div>
        `;
        uiLayer.appendChild(htpWindow);

        // イベント設定
        const preventTouch = (e) => e.stopPropagation();
        
        htpBtn.addEventListener('mousedown', preventTouch);
        htpBtn.addEventListener('touchstart', preventTouch, {passive: false});
        htpBtn.addEventListener('click', () => {
            htpWindow.style.display = 'flex';
            this.showIndex();
        });

        htpWindow.addEventListener('mousedown', preventTouch);
        htpWindow.addEventListener('touchstart', preventTouch, {passive: false});
        
        document.getElementById('htp-close-btn').addEventListener('click', () => {
            htpWindow.style.display = 'none';
        });
        
        document.getElementById('htp-back-btn').addEventListener('click', () => {
            this.showIndex();
        });
        
        // 目次ボタンを押したときのページ遷移処理
        const menuBtns = htpWindow.querySelectorAll('.htp-menu-btn');
        menuBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                this.showPage(btn.getAttribute('data-target'), btn.innerText);
            });
        });
        
        // 「つぎへ」「まえへ」ボタンの処理
        const navBtns = htpWindow.querySelectorAll('.htp-nav-btn');
        navBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                // 基本操作カテゴリ内の移動なので、タイトルは「1. 基本操作」で固定
                this.showPage(btn.getAttribute('data-target'), "1. 基本操作");
            });
        });
    },
    
    // 目次に戻る
    showIndex: function() {
        document.getElementById('htp-title').innerText = 'あそびかた';
        document.getElementById('htp-back-btn').style.visibility = 'hidden';
        
        const pages = document.querySelectorAll('.htp-page');
        pages.forEach(p => p.classList.remove('active'));
        document.getElementById('htp-index').classList.add('active');
    },
    
    // 指定したページを表示する
    showPage: function(pageId, title) {
        document.getElementById('htp-title').innerText = title;
        document.getElementById('htp-back-btn').style.visibility = 'visible';
        
        const pages = document.querySelectorAll('.htp-page');
        pages.forEach(p => p.classList.remove('active'));
        document.getElementById(pageId).classList.add('active');
    }
};
