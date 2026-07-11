// ==========================================
// gravity_router.js
// UIの生成から通信ロジックまでをすべて管理する外部モジュール
// ゲームURL添付用の多重アタック対応版
// ==========================================

(function initGravityRouter() {
    // 1. スタイルの動的生成
    const style = document.createElement('style');
    style.innerHTML = `
        :root {
            --bg-color: #1a1a2e;
            --panel-bg: #16213e;
            --primary-color: #e94560;
            --text-light: #ededed;
            --accent-color: #0f3460;
        }
        body {
            margin: 0;
            padding: 0;
            background-color: var(--bg-color);
            font-family: 'Helvetica Neue', Arial, 'Hiragino Kaku Gothic ProN', 'Hiragino Sans', sans-serif;
            color: var(--text-light);
            overflow: hidden;
            display: flex;
            flex-direction: column;
            align-items: center;
        }
        #game-app {
            width: 100%;
            max-width: 400px;
            height: 100vh;
            display: flex;
            flex-direction: column;
            box-sizing: border-box;
            overflow-y: auto;
            padding: 20px;
        }
        h1 {
            font-size: 20px;
            text-align: center;
            margin-bottom: 20px;
            color: #fff;
            border-bottom: 2px solid var(--primary-color);
            padding-bottom: 10px;
        }
        .test-section {
            background: var(--panel-bg);
            border: 2px solid var(--accent-color);
            border-radius: 8px;
            padding: 15px;
            margin-bottom: 15px;
        }
        .test-title {
            font-size: 13px;
            color: #a0a0a0;
            margin-bottom: 10px;
        }
        .btn {
            background-color: var(--primary-color);
            color: #fff;
            border: none;
            border-radius: 4px;
            padding: 12px;
            font-size: 14px;
            font-weight: bold;
            width: 100%;
            cursor: pointer;
            transition: transform 0.1s, opacity 0.2s, background-color 0.2s;
        }
        .btn:active {
            transform: scale(0.95);
            opacity: 0.8;
        }
        textarea {
            width: 100%;
            height: 80px;
            padding: 10px;
            box-sizing: border-box;
            background-color: #0f172a;
            color: #fff;
            border: 1px solid #334155;
            border-radius: 4px;
            font-size: 14px;
            resize: none;
            outline: none;
            margin-bottom: 10px;
        }
        textarea:focus {
            border-color: var(--primary-color);
        }
    `;
    document.head.appendChild(style);

    // 2. UI要素の動的生成
    const gameAppEl = document.getElementById('game-app');
    if (gameAppEl) {
        gameAppEl.innerHTML = `
            <h1>ルーター動作テスト</h1>

            <div class="test-section">
                <div class="test-title">プロフィール画面を開く機能</div>
                <button class="btn" onclick="GravityRouter.openProfile('1539168218')">なむぴょんのプロフィールを開く</button>
            </div>

            <div class="test-section">
                <div class="test-title">惑星画面を開く機能</div>
                <button class="btn" onclick="GravityRouter.openStar('17638')">AIゲーム工房を開く</button>
            </div>

            <div class="test-section">
                <div class="test-title">投稿画面を開く機能</div>
                <button class="btn" onclick="GravityRouter.openFeed('9_41721838')">7/11 Fall Grasリリースの投稿を開く</button>
            </div>

            <div class="test-section">
                <div class="test-title">質問ひろばを開く機能</div>
                <button class="btn" onclick="GravityRouter.openQuestion('147853')">テスト用に投稿した質問を開く</button>
            </div>

            <div class="test-section">
                <div class="test-title">ゲームURLを添付してシェアする機能</div>
                <textarea id="post-text-input" placeholder="テキストを入力">このAIゲーム楽しいよ、是非遊んでみて！</textarea>
                <button class="btn" onclick="createPostWithGame()">投稿画面へシェア</button>
            </div>
        `;
        
        // レイアウト補正（GRAVITYヘッダー領域回避）
        const screenHeight = window.innerHeight;
        const topExclusionHeight = screenHeight >= 812 ? 98 : 74;
        gameAppEl.style.paddingTop = topExclusionHeight + 'px';
    }

    // 3. iOS専用 ネイティブルーティング処理モジュール
    window.GravityRouter = {
        _sendToApp: function(command, paramObj) {
            const encodedJson = encodeURIComponent(JSON.stringify(paramObj));
            const innerUrl = command + "?0=" + encodedJson;
            const deepLink = "slme://internal?type=5&ani=1&url=" + encodeURIComponent(innerUrl);

            try {
                window.top.location.href = deepLink;
            } catch (e) {
                let i = document.createElement('iframe');
                i.style.cssText = 'position:absolute;width:0;height:0;opacity:0';
                i.src = deepLink;
                document.body.appendChild(i);
                setTimeout(function() { i.remove(); }, 5000);
            }
        },
        openProfile: function(userId) {
            const paramObj = { uid: Number(userId), selectedIndex: 0, web_url: "https://www.gravity.place/user/" + userId, s: "web", b: "user" };
            this._sendToApp("usercenter", paramObj);
        },
        openStar: function(starId) {
            const paramObj = { starId: Number(starId), s: "web", b: "star", web_url: "https://www.gravity.place/star/" + starId };
            this._sendToApp("stardetail", paramObj);
        },
        openFeed: function(feedId) {
            const paramObj = { id: String(feedId), s: "web", b: "feed", web_url: "https://www.gravity.place/detail/" + feedId };
            this._sendToApp("feeddetail", paramObj);
        },
        openQuestion: function(questionId) {
            const paramObj = { qid: String(questionId), s: "web", b: "ask_feed", selectedIndex: 0, web_url: "https://www.gravity.place/ask-feed/" + questionId };
            this._sendToApp("hotquestiondetail", paramObj);
        },
        // テキストとゲームURLの両方を受け取って多重アタックを仕掛ける
        createPost: function(text, gameUrl) {
            const paramObj = { 
                s: "web", 
                b: "makefeed", 
                text: String(text),
                // アプリ側が「添付リンク」として拾ってくれる可能性のあるキーを総当たりでねじ込む
                url: String(gameUrl),
                link: String(gameUrl),
                shareUrl: String(gameUrl),
                ugcGameId: "43660" 
            };
            this._sendToApp("makefeed", paramObj);
        }
    };

    // 4. ゲーム付き投稿呼び出し関数
    window.createPostWithGame = function() {
        const textArea = document.getElementById('post-text-input');
        const textValue = textArea ? textArea.value : "";
        const gameLink = "https://www.gravity.place/share/ugcGame?id=43660";
        
        window.GravityRouter.createPost(textValue, gameLink);
    };
})();
