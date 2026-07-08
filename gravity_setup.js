// =========================================
// gravity_setup.js
// マッチングUI、Gravity SDKの初期化とエラー処理
// =========================================

document.addEventListener('DOMContentLoaded', async () => {

    // ★変更: isHost（ルーム作成者かどうか）のフラグを追加
    const State = { isLocalMode: false, userInfo: null, currentRoomId: null, roomUsers: [], isHost: false };
    window.GameState = State;

    const screens = { 
        loading: document.getElementById('screen-loading'), 
        room: document.getElementById('screen-room') 
    };
    const roomListContainer = document.getElementById('room-list');
    const msgElement = document.getElementById('loading-msg');

    function showScreen(screenName) {
        Object.values(screens).forEach(s => { if(s) s.classList.remove('active'); });
        if(screens[screenName]) screens[screenName].classList.add('active');
    }

    // =========================================
    // 1. SDKの初期化と確実なタイムアウト処理
    // =========================================
    async function initSDK() {
        if (!window.AgentSDK) {
            console.warn("Gravity SDK not found.");
            fallbackToLocalMode("SDKが見つかりません。");
            return;
        }

        const timeoutPromise = new Promise(resolve => setTimeout(() => resolve('TIMEOUT'), 3000));
        
        try {
            const result = await Promise.race([ window.AgentSDK.user.getMyUserInfo(), timeoutPromise ]);
            
            if (result === 'TIMEOUT') {
                console.warn("SDK Request Timeout.");
                fallbackToLocalMode("通信タイムアウトしました。");
                
            } else if (result && result.errno === 0) {
                State.userInfo = result.data;
                console.log("SDK User Info:", State.userInfo);
                
                try {
                    const roomRes = await window.AgentSDK.room.getRoomId();
                    if (roomRes && roomRes.room_id) {
                        await joinExistingRoom(roomRes.room_id);
                        return; 
                    }
                } catch(e) {
                    console.log("既存のルームIDなし");
                }
                
                showScreen('room');
                refreshRoomList();
                
            } else {
                console.warn("SDK API Error:", result);
                fallbackToLocalMode("初期化エラーが発生しました。");
            }
        } catch (e) {
            console.error("SDK Initialization Error:", e);
            fallbackToLocalMode("エラーにより通信できません。");
        }
    }

    // =========================================
    // 2. ローカルフォールバック
    // =========================================
    function fallbackToLocalMode(reasonMsg) {
        State.isLocalMode = true;
        const dummyUserId = Math.floor(Math.random() * 10000);
        State.userInfo = { name: 'Guest_' + dummyUserId, user_id: dummyUserId, portrait: '' };
        
        window.AgentSDK = window.AgentSDK || {};
        window.AgentSDK.room = {
            create: async () => ({ errno: 0, data: { room_id: 'local_room_' + dummyUserId } }),
            join: async (p) => ({ errno: 0, data: { room_id: p.room_id, max_players: 1, current_player: 1, user_list: [State.userInfo] } }),
            getPublicRoomList: async () => ({ errno: 0, data: { list: [] } }),
            sendMessage: async () => ({ errno: 0 }),
            receiveMessage: () => {},
            exit: async () => ({ errno: 0 }),
            getRoomId: async () => ({ room_id: '' })
        };

        if (msgElement) msgElement.innerText = reasonMsg + " オフラインモードで起動します";
        
        setTimeout(() => {
            showScreen('room');
            if (roomListContainer) roomListContainer.innerHTML = '<div class="empty-text">ローカルモードのため一覧は表示されません。</div>';
        }, 800); 
    }

    // =========================================
    // 3. UIのボタンイベントとルーム操作
    // =========================================
    const btnCreatePub = document.getElementById('btn-create-public');
    if (btnCreatePub) btnCreatePub.addEventListener('click', function() { handleCreateRoom(0, this); });
    
    const btnCreatePriv = document.getElementById('btn-create-private');
    if (btnCreatePriv) btnCreatePriv.addEventListener('click', function() { handleCreateRoom(1, this); });

    const btnRefresh = document.getElementById('btn-refresh');
    if (btnRefresh) btnRefresh.addEventListener('click', refreshRoomList);

    const btnLocalPlay = document.getElementById('btn-local-play');
    if (btnLocalPlay) btnLocalPlay.addEventListener('click', () => {
        State.isLocalMode = true;
        prepareGameRun('local_mode', [State.userInfo]);
    });

    const btnJoinById = document.getElementById('btn-join-by-id');
    if (btnJoinById) {
        btnJoinById.addEventListener('click', async function() {
            const inputId = document.getElementById('input-room-id').value.trim();
            if (!inputId) {
                alert("ルームIDを入力してください。");
                return;
            }
            
            const originalText = this.innerText;
            this.innerText = "入室中...";
            this.disabled = true;

            try {
                const res = await window.AgentSDK.room.join({ room_id: inputId });
                if (res && res.errno === 0) {
                    prepareGameRun(inputId, res.data.user_list);
                } else {
                    alert("入室できませんでした。IDが間違っているか、満室です。");
                    this.innerText = originalText;
                    this.disabled = false;
                }
            } catch(e) {
                console.error("Join Private Room Error:", e);
                alert("通信エラーが発生しました。");
                this.innerText = originalText;
                this.disabled = false;
            }
        });
    }

    async function handleCreateRoom(permission, btnElement) {
        if(btnCreatePub) btnCreatePub.disabled = true; 
        if(btnCreatePriv) btnCreatePriv.disabled = true;
        const originalText = btnElement.innerHTML;
        btnElement.innerHTML = "作成中...";
        
        const maxPlayers = 10;

        try {
            const res = await window.AgentSDK.room.create({ max_players: maxPlayers, room_permission: permission });
            if (res && res.errno === 0) {
                // ★追加: ルームを作成した場合は isHost フラグを立てる
                State.isHost = true;
                prepareGameRun(res.data.room_id, [State.userInfo]);
            } else {
                alert("ルーム作成に失敗しました: " + (res.errmsg || ''));
                resetCreateButtons(originalText, btnElement);
            }
        } catch(e) {
            console.error("Create Room Error:", e);
            resetCreateButtons(originalText, btnElement);
        }
    }

    function resetCreateButtons(originalText, btnElement) {
        if(btnCreatePub) btnCreatePub.disabled = false;
        if(btnCreatePriv) btnCreatePriv.disabled = false;
        if(btnElement) btnElement.innerHTML = originalText;
    }

    async function refreshRoomList() {
        if (!roomListContainer || State.isLocalMode) return;
        roomListContainer.innerHTML = '<div class="empty-text">検索中...</div>';
        try {
            const res = await window.AgentSDK.room.getPublicRoomList();
            if (res && res.errno === 0) {
                const list = res.data.list || [];
                if (list.length === 0) { 
                    roomListContainer.innerHTML = '<div class="empty-text">公開されている部屋がありません。</div>'; 
                    return; 
                }
                roomListContainer.innerHTML = '';
                list.forEach(room => {
                    const item = document.createElement('div'); 
                    item.className = 'room-item';
                    item.innerHTML = `
                        <div class="room-info">
                            <div class="room-id">ID: ${room.room_id}</div>
                            <div class="room-players">Players: ${room.gamer_num} / ${room.max_players}</div>
                        </div>
                        <button class="btn-join" data-roomid="${room.room_id}">参加</button>
                    `;
                    roomListContainer.appendChild(item);
                });
                document.querySelectorAll('.btn-join').forEach(btn => {
                    btn.addEventListener('click', (e) => { 
                        const id = e.target.getAttribute('data-roomid');
                        e.target.innerText = "参加中...";
                        e.target.disabled = true;
                        joinExistingRoom(id); 
                    });
                });
            } else {
                roomListContainer.innerHTML = '<div class="empty-text">リストの取得に失敗しました。</div>';
            }
        } catch(e) {
            console.error(e);
            roomListContainer.innerHTML = '<div class="empty-text">エラーが発生しました。</div>';
        }
    }

    async function joinExistingRoom(roomId) {
        try {
            const res = await window.AgentSDK.room.join({ room_id: roomId });
            if (res && res.errno === 0) {
                prepareGameRun(roomId, res.data.user_list);
            } else {
                alert("ルームへの参加に失敗しました: " + (res.errmsg || '満室または存在しません'));
                refreshRoomList();
            }
        } catch(e) {
            console.error("Join Room Error:", e);
            refreshRoomList();
        }
    }

    // =========================================
    // 4. マッチング完了、ゲームスクリプト(loader.js)起動
    // =========================================
    function prepareGameRun(roomId, userList) {
        State.currentRoomId = roomId; 
        State.roomUsers = userList || [State.userInfo];
        
        window.AgentSDK.room.receiveMessage((payload) => {
            if (typeof window.onMultiplayerMessage === 'function') {
                window.onMultiplayerMessage(payload);
            }
        });
        
        window.sendMultiplayerMessage = async function(msgData) {
            if (State.isLocalMode || !State.currentRoomId) return;
            try {
                await window.AgentSDK.room.sendMessage({ message: JSON.stringify(msgData) });
            } catch(e) {
                console.error('Send message failed:', e);
            }
        };
        
        const startupUI = document.getElementById('startup-ui');
        if (startupUI) startupUI.style.display = 'none';
        
        const script = document.createElement('script');
        script.src = "https://namnam2727.github.io/Fall_Gra/loader.js?v=" + new Date().getTime();
        document.body.appendChild(script);
    }

    // アプリ開始
    initSDK();
});
