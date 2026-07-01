// =====================================
// minigame_list.js
// ミニゲームのリストとプラグイン情報を管理
// =====================================

window.MinigameList = [
    {
        id: "survival",
        title: "崩壊サバイバル",
        icon: "minigames/survival.png",
        script: "minigames/survival.js",
        description: "時間経過とともに足場が崩落していく危険なエリア！落下せずに最後まで生き残ったプレイヤーの勝利だ！"
    },
    {
        id: "coin_rush",
        title: "コインラッシュ",
        icon: "minigames/coin_rush.png",
        script: "minigames/coin_rush.js",
        description: "フィールドに大量に出現するコインを集めろ！制限時間終了時に最も多くのコインを持っていたプレイヤーの勝利！"
    },
    {
        id: "tag_match",
        title: "大乱闘オニゴッコ",
        icon: "minigames/tag_match.png",
        script: "minigames/tag_match.js",
        description: "アイテムを駆使して逃げ切れ！鬼に捕まると自分も鬼になってしまうぞ。最後まで逃げ切れば生存者の勝利！"
    }
];
