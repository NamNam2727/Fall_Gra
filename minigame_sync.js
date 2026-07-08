// =====================================
// minigame_sync.js
// ミニゲームの通信・同期管理（3分割の1/3）
// ★ネットワークの受信、投票の同期、タイムスタンプによるカウントダウンの厳密な計算を担当
// =====================================

window.MinigameManager = window.MinigameManager || {};

Object.assign(window.MinigameManager, {
    // ---------------------------------
    // 状態管理変数群（全ファイルで共有）
    // ---------------------------------
    state: 'IDLE', // IDLE, PROPOSING, COUNTDOWN, PLAYING, RESULT
    currentProposal: null,
    myVote: null,
    
    proposeEndTime: 0,
    targetStartTime: 0, 
    targetEndTime: 0,
    earliestReadyTime: Infinity,
    
    currentPlugin: null,
    resultData: [],

    // ---------------------------------
    // ネットワーク受信処理
    // ---------------------------------
    handleNetworkMessage: function(msg) {
        if (msg.type === 'mg_propose') {
            this.receiveProposal(msg.proposal);
        } else if (msg.type === 'mg_vote') {
            if (this.currentProposal && this.currentProposal.votes) {
                this.currentProposal.votes[msg.userId] = msg.vote;
                this.checkProposingStatus();
            }
        } else if (msg.type === 'mg_cancel') {
            if (typeof this.cancelProposal === 'function') {
                this.cancelProposal(msg.reason);
            }
        } else if (msg.type === 'mg_ready') {
            this.receiveReady(msg.timestamp);
        } else if (msg.type === 'mg_sync_state') {
            this.syncState(msg.state, msg.targetStartTime, msg.proposal, msg.votes);
        } else if (msg.type === 'mg_plugin_sync') {
            if (this.currentPlugin && typeof this.currentPlugin.handleNetwork === 'function') {
                this.currentPlugin.handleNetwork(msg.data);
            }
        } else if (msg.type === 'mg_update_score') {
            // 他人のスコア確定情報（リタイア含む）を受信
            const data = this.resultData.find(d => d.id === msg.userId);
            if (data) {
                if (msg.isRetired && !data.isRetired && typeof window.addLog === 'function') {
                    window.addLog(`<span style="color:#ff3300;">${data.name} がリタイアしました。</span>`, 'sys');
                }
                data.scoreValue = msg.scoreValue;
                data.scoreText = msg.scoreText;
                data.statusText = msg.statusText; 
                data.isRetired = msg.isRetired;

                // ★すでにリザルト画面が表示されていれば、即座に上書きして動的に更新する
                if (this.state === 'RESULT' || (document.getElementById('mg-result-window') && document.getElementById('mg-result-window').style.display === 'flex')) {
                    if (window.MinigameUI && typeof window.MinigameUI.showResult === 'function') {
                        const gameName = document.getElementById('result-game-name') ? document.getElementById('result-game-name').innerText : "ミニゲーム";
                        window.MinigameUI.showResult(gameName, this.resultData);
                    }
                }
            }
        } else if (msg.type === 'mg_request_score') {
            if (typeof this.replyMyScore === 'function') this.replyMyScore();
        } else if (msg.type === 'mg_reply_score') {
            const statusEl = document.getElementById('member-score-' + msg.userId);
            if (statusEl) {
                statusEl.innerText = msg.currentScoreText;
                statusEl.style.color = '#ffaa00';
            }
        }
    },

    // ---------------------------------
    // 同期・投票・タイムスタンプ関連
    // ---------------------------------
    
    receiveProposal: function(proposal) {
        if (this.state !== 'IDLE') {
            if (this.state === 'PROPOSING' && this.currentProposal && proposal.timestamp < this.currentProposal.timestamp) {
                if (typeof this.cancelProposal === 'function') this.cancelProposal("より早く申請された別のゲームが優先されました。");
            } else {
                return;
            }
        }

        this.state = 'PROPOSING';
        this.currentProposal = proposal;
        this.myVote = null;
        this.earliestReadyTime = Infinity;

        this.proposeEndTime = proposal.timestamp + 60000;
        
        const mgBtn = document.getElementById('minigame-btn');
        if (mgBtn) {
            mgBtn.innerText = 'ゲーム詳細';
            mgBtn.classList.add('detail-mode');
        }

        if (typeof this.showProposalPopup === 'function') this.showProposalPopup();
        if (typeof this.startProposingTimer === 'function') this.startProposingTimer();
    },

    syncState: function(remoteState, targetStartTime, proposal, remoteVotes) {
        if (this.state !== 'IDLE' && this.state !== 'PROPOSING') return;

        this.currentProposal = proposal;
        if (remoteVotes && this.currentProposal) this.currentProposal.votes = remoteVotes;

        const myId = (window.GameState && window.GameState.userInfo) ? window.GameState.userInfo.user_id : 'local';

        if (remoteState === 'PROPOSING') {
            this.state = 'PROPOSING';
            this.proposeEndTime = proposal.timestamp + 60000;
            
            const mgBtn = document.getElementById('minigame-btn');
            if (mgBtn) {
                mgBtn.innerText = 'ゲーム詳細';
                mgBtn.classList.add('detail-mode');
            }
            
            // まだ未回答ならポップアップを表示
            if (this.currentProposal && this.currentProposal.votes && this.currentProposal.votes[myId] === undefined) {
                this.myVote = null;
                if (typeof this.showProposalPopup === 'function') this.showProposalPopup();
            }
            if (typeof this.startProposingTimer === 'function') this.startProposingTimer();

        } else if (remoteState === 'COUNTDOWN' || remoteState === 'PLAYING') {
            this.state = remoteState;
            this.myVote = false; 
            
            if (typeof this.closeAllViews === 'function') this.closeAllViews();
            if (typeof this.enterSpectatorMode === 'function') this.enterSpectatorMode();
            if (typeof this.loadPlugin === 'function') this.loadPlugin();

            if (remoteState === 'COUNTDOWN' && targetStartTime) {
                if (typeof this.startCountdown === 'function') this.startCountdown(targetStartTime); 
            } else if (remoteState === 'PLAYING') {
                const mgBtn = document.getElementById('minigame-btn');
                if (mgBtn) {
                    mgBtn.classList.remove('detail-mode');
                    mgBtn.classList.add('abort-mode');
                    mgBtn.innerText = '観戦モード';
                    mgBtn.classList.add('spectator-mode');
                }
            }
        }
    },

    sendMyVote: function(isJoin) {
        const myId = (window.GameState && window.GameState.userInfo) ? window.GameState.userInfo.user_id : 'local';
        this.myVote = isJoin;
        if (this.currentProposal && this.currentProposal.votes) {
            Object.assign(this.currentProposal.votes, { [myId]: isJoin });
        }
        
        if (window.MultiplayerManager) {
            window.MultiplayerManager.sendData({ type: 'mg_vote', userId: myId, vote: isJoin });
        }
        this.checkProposingStatus();
    },

    checkProposingStatus: function() {
        if (this.state !== 'PROPOSING' || !this.currentProposal) return;

        let totalUsers = 1;
        if (window.MultiplayerManager && window.MultiplayerManager.otherPlayers) {
            totalUsers = Object.keys(window.MultiplayerManager.otherPlayers).length + 1;
        }
        
        const answeredCount = Object.keys(this.currentProposal.votes || {}).length;

        // 全員が回答したら即座に準備へ移行
        if (answeredCount >= totalUsers) {
            this.proposeEndTime = 0; 
            if (typeof this.endProposingAndPrepare === 'function') {
                this.endProposingAndPrepare();
            }
        }
    },

    receiveReady: function(timestamp) {
        if (this.state === 'IDLE' || this.state === 'RESULT') return; 
        
        // ★自分より早いタイムスタンプが来たら、基準値を更新してタイマーを再計算する
        if (timestamp < this.earliestReadyTime) {
            this.earliestReadyTime = timestamp;
            if (this.state === 'COUNTDOWN') {
                this.calcTargetTimes();
            }
        }
    },

    calcTargetTimes: function() {
        // 最も早い時刻から10秒後を開始時刻とする
        this.targetStartTime = this.earliestReadyTime + 10000;
        
        if (this.currentProposal && this.currentProposal.settings && this.currentProposal.settings.time) {
            const timeLimitSec = parseInt(this.currentProposal.settings.time, 10) * 60;
            this.targetEndTime = this.targetStartTime + (timeLimitSec * 1000);
        }
    }
});
