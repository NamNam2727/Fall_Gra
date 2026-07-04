// =====================================
// player.js
// プレイヤーキャラクターの生成とテクスチャ、吹き出し処理
// ★チャットの吹き出しを文字数に合わせて自動リサイズ＆折り返し表示に対応
// =====================================

function createIconTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 512;
    const ctx = canvas.getContext('2d');
    
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 512, 512);
    ctx.beginPath(); ctx.arc(256, 256, 240, 0, Math.PI * 2);
    ctx.fillStyle = '#FFDD88'; ctx.fill();
    ctx.lineWidth = 12; ctx.strokeStyle = '#FFAA00'; ctx.stroke();

    ctx.fillStyle = '#333333';
    ctx.beginPath(); ctx.arc(180, 320, 30, 0, Math.PI * 2); ctx.fill(); 
    ctx.beginPath(); ctx.arc(332, 320, 30, 0, Math.PI * 2); ctx.fill(); 
    ctx.beginPath(); ctx.arc(256, 320, 80, 0.2 * Math.PI, 0.8 * Math.PI); 
    ctx.lineWidth = 16; ctx.strokeStyle = '#333333'; ctx.stroke();

    ctx.fillStyle = '#FFFFFF'; ctx.font = 'bold 90px sans-serif'; 
    ctx.textAlign = 'center'; ctx.fillText('G', 256, 220);

    const texture = new THREE.CanvasTexture(canvas);
    texture.center.set(0.5, 0.5);
    texture.rotation = -Math.PI / 2; 
    
    if (typeof renderer !== 'undefined' && renderer) texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    return texture;
}

function createNameSprite(name) {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 128;
    const ctx = canvas.getContext('2d');
    
    ctx.font = 'bold 50px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 6; ctx.strokeStyle = '#000000'; ctx.strokeText(name, 256, 64);
    ctx.fillStyle = '#FFFFFF'; ctx.fillText(name, 256, 64);
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter; 
    
    const material = new THREE.SpriteMaterial({ map: texture });
    const sprite = new THREE.Sprite(material);
    
    sprite.scale.set(4, 1, 1);
    sprite.position.y = 1.8; 
    
    return sprite;
}

// ★ チャットの吹き出しを自動リサイズ＆折り返し表示する関数
window.showChatBubble = function(targetMesh, text) {
    // 既に吹き出しがあれば削除
    if (targetMesh.chatSprite) {
        targetMesh.remove(targetMesh.chatSprite);
        if (targetMesh.chatSprite.material.map) targetMesh.chatSprite.material.map.dispose();
        targetMesh.chatSprite.material.dispose();
        targetMesh.chatSprite = null;
    }

    // まずテキストを計測するための見えないCanvasを用意
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.font = 'bold 44px sans-serif';
    
    const MAX_TEXT_WIDTH = 400; // 1行の最大幅
    const lines = [];
    let currentLine = "";
    
    // 文字の長さに合わせて自動で改行を挿入
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (char === '\n') {
            lines.push(currentLine);
            currentLine = "";
            continue;
        }
        const testLine = currentLine + char;
        const metrics = tempCtx.measureText(testLine);
        if (metrics.width > MAX_TEXT_WIDTH && i > 0) {
            lines.push(currentLine);
            currentLine = char;
        } else {
            currentLine = testLine;
        }
    }
    if (currentLine) {
        lines.push(currentLine);
    }

    // すべての行の中で最も長い幅を特定
    let maxLineWidth = 0;
    for (let line of lines) {
        const w = tempCtx.measureText(line).width;
        if (w > maxLineWidth) maxLineWidth = w;
    }

    // 吹き出しの余白とサイズを計算
    const paddingX = 30;
    const paddingY = 20;
    const lineHeight = 50;
    
    const bubbleWidth = Math.max(maxLineWidth + paddingX * 2, 80);
    const bubbleHeight = lines.length * lineHeight + paddingY * 2;
    const tailHeight = 30;
    
    // 実際のCanvasを生成
    const canvas = document.createElement('canvas');
    canvas.width = bubbleWidth + 20;  // 左右の影や線の余白
    canvas.height = bubbleHeight + tailHeight + 20; // 上下の余白
    const ctx = canvas.getContext('2d');

    // 吹き出しの背景（角丸＋しっぽ）を描画
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 6;
    
    const x = 10, y = 10, radius = 20;
    
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + bubbleWidth - radius, y);
    ctx.quadraticCurveTo(x + bubbleWidth, y, x + bubbleWidth, y + radius);
    ctx.lineTo(x + bubbleWidth, y + bubbleHeight - radius);
    ctx.quadraticCurveTo(x + bubbleWidth, y + bubbleHeight, x + bubbleWidth - radius, y + bubbleHeight);
    
    // しっぽの描画（常に中央に配置）
    const tailCenter = x + bubbleWidth / 2;
    ctx.lineTo(tailCenter + 20, y + bubbleHeight);
    ctx.lineTo(tailCenter, y + bubbleHeight + tailHeight);
    ctx.lineTo(tailCenter - 20, y + bubbleHeight);
    
    ctx.lineTo(x + radius, y + bubbleHeight);
    ctx.quadraticCurveTo(x, y + bubbleHeight, x, y + bubbleHeight - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    ctx.fill(); 
    ctx.stroke();

    // 文字の描画
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 44px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    const startY = y + paddingY + lineHeight / 2;
    for (let i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i], x + bubbleWidth / 2, startY + i * lineHeight);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    
    const material = new THREE.SpriteMaterial({ map: texture, depthTest: false }); 
    const sprite = new THREE.Sprite(material);
    
    // Canvasの解像度に合わせて、3D空間上のスケールを自動調整
    const scaleFactor = 102.4;
    sprite.scale.set(canvas.width / scaleFactor, canvas.height / scaleFactor, 1);
    
    // 吹き出しが大きくなっても、しっぽの先端がネームプレートの真上に来るようにY座標を調整
    sprite.position.y = 2.2 + (canvas.height / scaleFactor) / 2;
    
    targetMesh.add(sprite);
    targetMesh.chatSprite = sprite;
    targetMesh.chatTimer = 5.0; // 5秒表示
};

function initPlayer() {
    player = new THREE.Group();
    
    const baseGeo = new THREE.CylinderGeometry(playerRadius, playerRadius, 0.2, 32);
    const blackMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.7 });
    const baseMesh = new THREE.Mesh(baseGeo, blackMat);
    baseMesh.position.y = 0.1; baseMesh.castShadow = true; 
    player.add(baseMesh);

    const topGeo = new THREE.CylinderGeometry(playerRadius, playerRadius, 0.2, 32);
    const defaultIconTexture = createIconTexture();
    const sideMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.7 });
    const topMat = new THREE.MeshStandardMaterial({ map: defaultIconTexture, roughness: 0.7 });
    const bottomMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.7 });
    
    const topMesh = new THREE.Mesh(topGeo, [sideMat, topMat, bottomMat]);
    topMesh.position.y = 0.3; topMesh.castShadow = true; 
    player.add(topMesh);

    let userName = "Player";
    if (window.GameState && window.GameState.userInfo && window.GameState.userInfo.name) {
        userName = window.GameState.userInfo.name;
    }
    const nameSprite = createNameSprite(userName);
    player.add(nameSprite);

    player.position.set(0, 20, 0);
    scene.add(player);

    if (window.GameState && window.GameState.userInfo && window.GameState.userInfo.portrait) {
        const imageUrl = window.GameState.userInfo.portrait;
        const loader = new THREE.TextureLoader();
        loader.setCrossOrigin('anonymous');
        loader.load(
            imageUrl,
            function (loadedTexture) {
                loadedTexture.center.set(0.5, 0.5);
                loadedTexture.rotation = -Math.PI / 2;
                if (typeof renderer !== 'undefined' && renderer) loadedTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
                loadedTexture.minFilter = THREE.LinearMipmapLinearFilter;
                loadedTexture.magFilter = THREE.LinearFilter;
                
                topMesh.material[1].map = loadedTexture;
                topMesh.material[1].needsUpdate = true;
            },
            undefined, function (err) {}
        );
    }
}
