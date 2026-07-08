// =====================================
// minigame_sync.js
// ミニゲームの通信・同期管理（3分割の1/3）
// ★全員のタイムスタンプから一番早い時刻を採用し、逆算して同期する仕様に復元
// ★リザルト本スコアと、メンバーリスト用の現在スコアの処理を完全分離
// =====================================

window.MinigameManager = window.MinigameManager || {};

Object.assign(window.MinigameManager, {
    state: 'IDLE', // IDLE, PROPOSING, COUNTDOWN, PLAYING, RESULT
    currentProposal: null,
    myVote: null,
    
    proposeEndTime: 0,
    targetStartTime: 0, 
    targetEndTime: 0,
    earliestReadyTime: Infinity,
    
    currentPlugin: null,
    resultData: [],

    handleNetworkMessage: function(msg) {
        if (msg.type === 'mg_propose') {
            if (typeof this.receiveProposal === 'function') this.receiveProposal(msg.proposal);
        } else if (msg.type === 'mg_vote') {
            if (this.currentProposal && this.currentProposal.votes) {
                this.currentProposal.votes[String(msg.userId)] = msg.vote;
                if (typeof this.checkProposingStatus === 'function') this.checkProposingStatus();
            }
        } else if (msg.type === 'mg_cancel') {
            if (typeof this.cancelProposal === 'function') this.cancelProposal(msg.reason);
        } else if (msg.type === 'mg_ready') {
            if (typeof this.receiveReady === 'function') this.receiveReady(msg.timestamp);
        } else if (msg.type === 'mg_sync_state') {
            if (typeof this.syncState === 'function') this.syncState(msg.state, msg.targetStartTime, msg.proposal, msg.votes);
        } else if (msg.type === 'mg_plugin_sync') {
            if (this.currentPlugin && typeof this.currentPlugin.handleNetwork === 'function') {
                this.currentPlugin.handleNetwork(msg.data);
            }
        } else if (msg.type === 'mg_update_score') {
            // ★ リザルト用の「本スコア」を受信
            const data = this.resultData.find(d => String(d.id) === String(msg.userId));
            if (data) {
                if (msg.isRetired && !data.isRetired && typeof window.addLog === 'function') {
                    window.addLog(`<span style="color:#ff3300;">${data.name} がリタイアしました。</span>`, 'sys');
                }
                data.scoreValue = msg.scoreValue;
                data.scoreText = msg.scoreText;
                data.statusText = msg.statusText; 
                data.isRetired = msg.isRetired;

                // リザルト画面が開いていれば動的に上書き更新
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
            // ★ メンバーリスト用の「現在のスコア」を受信
            const data = this.resultData.find(d => String(d.id) === String(msg.userId));
            if (data) {
                data.currentScoreText = msg.currentScoreText;
                data.currentScoreValue = msg.currentScoreValue;
                data.currentStatusText = msg.currentStatusText;
                
                // リタイアしていないユーザーのみ、現状のスコアを画面に反映
                if (!data.isRetired) {
                    const statusEl = document.getElementById('member-score-' + msg.userId);
                    if (statusEl) {
                        statusEl.innerText = msg.currentScoreText;
                        statusEl.style.color = '#ffaa00';
                    }
                }
            }
        }
    },

    syncState: function(remoteState, targetStartTime, proposal, remoteVotes) {
        if (this.state !== 'IDLE' && this.state !== 'PROPOSING') return;

        this.currentProposal = proposal;
        if (remoteVotes && this.currentProposal) this.currentProposal.votes = remoteVotes;

        const myId = String((window.GameState && window.GameState.userInfo) ? window.GameState.userInfo.user_id : 'local');

        if (remoteState === 'PROPOSING') {
            this.state = 'PROPOSING';
            this.proposeEndTime = proposal.timestamp + 60000;
            
            const mgBtn = document.getElementById('minigame-btn');
            if (mgBtn) {
                mgBtn.innerText = 'ゲーム詳細';
                mgBtn.classList.add('detail-mode');
            }
            
            if (this.currentProposal.votes && this.currentProposal.votes[myId] === undefined) {
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
        const myId = String((window.GameState && window.GameState.userInfo) ? window.GameState.userInfo.user_id : 'local');
        this.myVote = isJoin;
        if (this.currentProposal && this.currentProposal.votes) {
            this.currentProposal.votes[myId] = isJoin;
        }
        
        if (window.MultiplayerManager) {
            window.MultiplayerManager.sendData({ type: 'mg_vote', userId: myId, vote: isJoin });
        }
        if (typeof this.checkProposingStatus === 'function') this.checkProposingStatus();
    },

    receiveReady: function(timestamp) {
        if (this.state === 'IDLE' || this.state === 'RESULT') return; 
        
        // ★ タイムスタンプが一番早い（過去の）ものを基準として採用
        if (timestamp < this.earliestReadyTime) {
            this.earliestReadyTime = timestamp;
            if (this.state === 'COUNTDOWN') {
                if (typeof this.calcTargetTimes === 'function') this.calcTargetTimes();
            }
        }
    },

    calcTargetTimes: function() {
        // 一番早いタイムスタンプから10秒後をターゲット開始時間に設定
        this.targetStartTime = this.earliestReadyTime + 10000;
        
        if (this.currentProposal && this.currentProposal.settings && this.currentProposal.settings.time) {
            const timeLimitSec = parseInt(this.currentProposal.settings.time, 10) * 60;
            this.targetEndTime = this.targetStartTime + (timeLimitSec * 1000);
        }
    }
});
