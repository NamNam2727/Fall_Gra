// =====================================
// gravity_router.js
// iOS専用 ネイティブ画面遷移モジュール
// メインHTMLの初期起動サイズを削減するため、外部ファイルとして分離しています
// =====================================

window.GravityRouter = {
    // 内部通信用コアロジック (iOS専用 iframe方式)
    _sendToApp: function(payloadStr) {
        // HNivcbOp.jsで判明した2重エンコード仕様を適用
        const encodedPayload = encodeURIComponent(payloadStr);
        const deepLink = "slme://internal?type=5&ani=1&url=" + encodeURIComponent(encodedPayload);

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

    // 1. プロフィール画面を開く
    openProfile: function(userId) {
        const paramObj = {
            uid: userId,
            selectedIndex: 0,
            web_url: "https://www.gravity.place/user/" + userId,
            s: "web",
            b: "user"
        };
        this._sendToApp("usercenter?0=" + JSON.stringify(paramObj));
    },

    // 2. 星（コミュニティ）画面を開く
    openStar: function(starId) {
        const paramObj = {
            starId: starId,
            s: "web",
            b: "star",
            web_url: "https://www.gravity.place/star/" + starId
        };
        this._sendToApp("stardetail?0=" + JSON.stringify(paramObj));
    },

    // 3. 特定の投稿（フィード）を開く
    openFeed: function(feedId) {
        const paramObj = {
            id: feedId,
            s: "web",
            b: "feed",
            web_url: "https://www.gravity.place/detail/" + feedId
        };
        this._sendToApp("feeddetail?0=" + JSON.stringify(paramObj));
    },

    // 4. Q&A（質問ひろば）を開く
    openQuestion: function(questionId) {
        const paramObj = {
            qid: questionId,
            s: "web",
            b: "ask_feed",
            selectedIndex: 0,
            web_url: "https://www.gravity.place/ask-feed/" + questionId
        };
        this._sendToApp("hotquestiondetail?0=" + JSON.stringify(paramObj));
    },

    // 5. 投稿作成画面を立ち上げる (テキストのみ)
    createPost: function(text) {
        const paramObj = {
            s: "web",
            b: "makefeed",
            text: text
        };
        this._sendToApp("makefeed?0=" + JSON.stringify(paramObj));
    },

    // 6. 投稿作成画面を立ち上げる (画像＋テキスト)
    createPostWithImage: function(text, base64Image) {
        // ① 先に iframe の外（アプリ本体）へ画像データを送信し、一時保存させる
        // test.html で使用されていた公式の画像引き渡し通信を利用
        window.parent.postMessage({ 
            type: 'shareImage', 
            image: base64Image 
        }, '*');

        // ② 少し遅延させて（画像の受け渡し完了を待ってから）、投稿画面を開く命令を出す
        const paramObj = {
            s: "web",
            b: "makefeed",
            text: text
        };
        
        const self = this;
        setTimeout(function() {
            self._sendToApp("makefeed?0=" + JSON.stringify(paramObj));
        }, 300); // 0.3秒待機
    }
