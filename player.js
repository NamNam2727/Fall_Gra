// =====================================
// player.js
// プレイヤーキャラクターの生成とテクスチャ、吹き出し処理
// =====================================

function createIconTexture() {
    const t0 = performance.now(); // ★計測開始

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
    
    const t1 = performance.now(); // ★計測終了
    const elapsed = (t1 - t0).toFixed(2);
    console.log(`[Perf] createIconTexture: ${elapsed}ms`);
    if (window.addLog) window.addLog(`<span style="color:#aaffaa;">[Perf] IconTex: ${elapsed}ms</span>`, 'sys');

    return texture;
}

function createNameSprite(name) {
    const t0 = performance.now(); // ★計測開始

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
    
    const t1 = performance.now(); // ★計測終了
    const elapsed = (t1 - t0).toFixed(2);
    console.log(`[Perf] createNameSprite(${name}): ${elapsed}ms`);
    if (window.addLog) window.addLog(`<span style="color:#aaffaa;">[Perf] NameSprite(${name}): ${elapsed}ms</span>`, 'sys');

    return sprite;
}

// ★ チャットの吹き出し(Sprite)を生成・管理する関数
window.showChatBubble = function(targetMesh, text) {
    if (targetMesh.chatSprite) {
        targetMesh.remove(targetMesh.chatSprite);
        if (targetMesh.chatSprite.material.map) targetMesh.chatSprite.material.map.dispose();
        targetMesh.chatSprite.material.dispose();
        targetMesh.chatSprite = null;
    }

    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 256; 
    const ctx = canvas.getContext('2d');
    
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 6;
    
    const x = 10, y = 10, width = 492, height = 150, radius = 20;
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    
    ctx.lineTo(276, y + height);
    ctx.lineTo(256, y + height + 30); 
    ctx.lineTo(236, y + height);
    
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    ctx.fill(); ctx.stroke();

    ctx.fillStyle = '#000000';
    ctx.font = 'bold 44px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    let displayText = text;
    if (displayText.length > 15) displayText = displayText.substring(0, 15) + '...';
    ctx.fillText(displayText, 256, y + height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    
    const material = new THREE.SpriteMaterial({ map: texture, depthTest: false }); 
    const sprite = new THREE.Sprite(material);
    
    sprite.scale.set(5, 2.5, 1);
    sprite.position.y = 3.5; 
    
    targetMesh.add(sprite);
    targetMesh.chatSprite = sprite;
    targetMesh.chatTimer = 5.0; 
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
        
        const t0 = performance.now(); // ★計測開始 (TextureLoader同期的セットアップ)
        loader.load(
            imageUrl,
            function (loadedTexture) {
                const cb0 = performance.now(); // ★計測開始 (コールバック処理)
                
                loadedTexture.center.set(0.5, 0.5);
                loadedTexture.rotation = -Math.PI / 2;
                if (typeof renderer !== 'undefined' && renderer) loadedTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
                loadedTexture.minFilter = THREE.LinearMipmapLinearFilter;
                loadedTexture.magFilter = THREE.LinearFilter;
                
                topMesh.material[1].map = loadedTexture;
                topMesh.material[1].needsUpdate = true;
                
                const cb1 = performance.now(); // ★計測終了
                const cbElapsed = (cb1 - cb0).toFixed(2);
                console.log(`[Perf] TexLoad Callback (MyPlayer): ${cbElapsed}ms`);
                if (window.addLog && (cb1 - cb0) > 5) window.addLog(`<span style="color:#ffaa00;">[Perf] MyTexCB: ${cbElapsed}ms</span>`, 'sys');
            },
            undefined, function (err) {}
        );
        const t1 = performance.now(); // ★計測終了
        const elapsed = (t1 - t0).toFixed(2);
        console.log(`[Perf] TextureLoader.load Trigger: ${elapsed}ms`);
    }
}
