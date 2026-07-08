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
            
            .htp-temp-text {
                color: #aaa; text-align: center; margin-top: 20px; font-size: 14px; line-height: 1.5;
            }
        `;
        document.head.appendChild(style);

        const uiLayer = document.getElementById('ui-layer');
        if (!uiLayer) return;

        const screenHeight = window.innerHeight;
        const topExclusionHeight = screenHeight >= 812 ? 98 : 74; 
        
        // ★ ミニゲームボタンの下に配置するため、Y座標に60px(ボタンの高さ+隙間)を足す
        const htpBtn = document.createElement('div');
        htpBtn.id = 'how-to-play-btn';
        htpBtn.innerText = 'あそびかた';
        htpBtn.style.top = (topExclusionHeight + 15 + 60) + 'px'; 
        uiLayer.appendChild(htpBtn);

        const htpWindow = document.createElement('div');
        htpWindow.id = 'htp-window';
        // ★ 上端をミニゲームボタンと同じ高さにし、そこから下に広げる（GravityのUIには被らない）
        htpWindow.style.top = (topExclusionHeight + 15) + 'px';
        htpWindow.style.height = `calc(100% - ${topExclusionHeight + 15 + 20}px)`; // 下には20pxの余白
        
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

                <!-- ＝＝＝ 各説明ページ（今回は仮枠のみ） ＝＝＝ -->
                <div id="htp-page-basic" class="htp-page">
                    <div class="htp-temp-text">ここに「1. 基本操作」<br>（移動・ジャンプ・カメラなど）<br>の画像や説明が入ります。<br><br>※次回実装</div>
                </div>
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
    },
    
    // 目次に戻る
    showIndex: function() {
        document.getElementById('htp-title').innerText = 'あそびかた';
        document.getElementById('htp-back-btn').style.visibility = 'hidden'; // ←ボタンを隠す
        
        const pages = document.querySelectorAll('.htp-page');
        pages.forEach(p => p.classList.remove('active'));
        document.getElementById('htp-index').classList.add('active');
    },
    
    // 指定したページを表示する
    showPage: function(pageId, title) {
        // タイトルをボタンのテキスト（例: "1. 基本操作"）に変更
        document.getElementById('htp-title').innerText = title;
        document.getElementById('htp-back-btn').style.visibility = 'visible'; // ←ボタンを表示
        
        const pages = document.querySelectorAll('.htp-page');
        pages.forEach(p => p.classList.remove('active'));
        document.getElementById(pageId).classList.add('active');
    }
};
