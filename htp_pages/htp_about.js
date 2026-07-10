// =====================================
// htp_about.js
// あそびかた：5. このゲームについて
// サブフォルダ (htp_pages) から動的に読み込まれます
// =====================================

window.HTP_About = {
    init: function(container, htpManager) {
        // 3Dデモ画面は使用しないため停止・非表示化
        htpManager.stopDemo();

        const style = document.createElement('style');
        style.innerHTML = `
            .htp-about-container {
                display: flex;
                flex-direction: column;
                justify-content: center;
                align-items: center;
                padding: 20px;
                gap: 20px;
                background: rgba(0, 0, 0, 0.5);
                border-radius: 8px;
                margin-top: 10px;
                font-family: sans-serif;
            }
            .htp-about-user-info {
                display: flex;
                align-items: center;
                gap: 16px;
                background: rgba(255, 255, 255, 0.1);
                padding: 15px;
                border-radius: 12px;
                width: 100%;
                box-sizing: border-box;
                justify-content: center;
            }
            .htp-about-avatar {
                width: 80px;
                height: 80px;
                border-radius: 50%;
                object-fit: cover;
                background-color: #e0e0e0;
                box-shadow: 0 4px 10px rgba(0,0,0,0.5);
                border: 2px solid rgba(255,255,255,0.8);
            }
            .htp-about-user-name {
                font-size: 20px;
                font-weight: bold;
                color: #ffffff;
            }
            .htp-about-msg {
                color: #ddd;
                font-size: 14px;
                line-height: 1.6;
                text-align: center;
            }
            .htp-about-download {
                background: #000;
                border-radius: 60px;
                border: 2px solid #ffaa00;
                color: #fedaa3;
                font-size: 14px;
                font-weight: bold;
                height: 44px;
                line-height: 40px;
                text-align: center;
                width: 250px;
                text-decoration: none;
                display: inline-block;
                transition: opacity 0.2s, transform 0.1s;
                box-shadow: 0 4px 10px rgba(0,0,0,0.5);
                cursor: pointer;
            }
            .htp-about-download:active {
                opacity: 0.8;
                transform: scale(0.95);
            }
        `;
        container.appendChild(style);

        container.innerHTML += `
            <div class="htp-about-container">
                <div class="htp-about-user-info">
                    <img src="https://cdn.gravity.place/virtual/portrait/online/20250606/07e8cf95-8762-414a-af4c-d2b5bf1be226.png" alt="なむぴょん" class="htp-about-avatar">
                    <span class="htp-about-user-name">なむぴょん</span>
                </div>
                
                <div class="htp-about-msg">
                    遊んでくれてありがとう。<br>
                    楽しかったら右上の[･･･]ボタンから<br>
                    <span style="color:#ff4444;">❤️いいね</span>を押してね。<br><br>
                    不具合・ご意見・ご要望・感想等があれば、<br>
                    メッセージやコメントを送ってね。<br>
                    <span style="color:#ffcc00; font-weight:bold;">特に、感想をくれるとめちゃくちゃ喜ぶよ！</span>
                </div>

                <div class="htp-about-download" id="openGravityProfileBtn">プロフィールを開く</div>
            </div>
        `;

        const profileBtn = container.querySelector('#openGravityProfileBtn');
        if (profileBtn) {
            profileBtn.addEventListener('click', function(event) {
                event.preventDefault();
                
                const userId = "1539168218";
                const webUrl = "https://www.gravity.place/user/" + userId;
                
                // 公式ファイル (HNivcbOp.js) のロジックを完全再現
                const T = encodeURIComponent(webUrl); // URLを一度エンコード
                const S = "web";
                const v = "user"; // 内部トラッキング用
                
                // iOS用の特殊な二重エンコードロジック
                const iosPayload = `usercenter?0={"uid":${userId},"selectedIndex":0,"web_url":"${T}","s":"${S}","b":"${v}"}`;
                const x = encodeURIComponent(iosPayload);
                const iosDeepLink = `slme://internal?type=5&ani=1&url=${encodeURIComponent(x)}`;
                
                // Android用の直接指定ロジック
                const androidDeepLink = `slme://gravity.creativeappnow.com/userHomePager?userId=${userId}&web_url=${T}&b=${v}&s=${S}`;

                // OS判定
                const ua = navigator.userAgent.toLowerCase();
                const isIOS = /(iphone|ipad|ipod|ios|macintosh|apple)/i.test(ua);
                
                const finalDeepLink = isIOS ? iosDeepLink : androidDeepLink;

                // ゲームのiframeから親（アプリ本体）へ強制的にリンクを踏ませる
                try {
                    // 親フレームに直接ディープリンクを流し込み、アプリのネイティブ遷移を誘発する
                    window.top.location.href = finalDeepLink;
                } catch (e) {
                    // セキュリティ制約でtopにアクセスできない場合の保険
                    let a = document.createElement('a');
                    a.href = finalDeepLink;
                    a.target = "_top";
                    a.style.display = "none";
                    document.body.appendChild(a);
                    a.click();
                    setTimeout(function() { a.remove(); }, 100);
                }
                
                // ※ここにWebページへのフォールバック（強制遷移）を入れるとネイティブ処理を阻害するため、
                // 公式コードと同様に、リンクを叩き込むだけの処理に留めています。
            });
        }
    },

    updateScenario: function(time, delta, demo) {
        // 3Dデモを使用しないため処理なし
    },

    onWarp: function(warpX, warpZ) {
        // 処理なし
    },

    cleanup: function(htpManager) {
        // 処理なし
    }
};
