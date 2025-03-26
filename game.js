const config = {
    type: Phaser.AUTO,
    width: 540,
    height: 540,
    scene: {
        preload: preload,
        create: create,
        update: update
    }
};
const game = new Phaser.Game(config);
let player1, player2;
let currentPlayer = 1; // 1: 플레이어 1, 2: 플레이어 2
let validMoves = []; // 이동 가능한 칸을 저장할 배열
let moveIndicators = []; // 이동 가능한 칸 표시를 저장할 배열
let wallIndicators = []; // 벽 표시를 저장할 배열
const cellSize = 60; // 셀 크기
let isPlacingWall = false; // 벽을 드는 중인지 여부
let wallOrientation = 'horizontal'; // 벽의 방향 (가로 또는 세로)
let walls = []; // 설치된 벽 정보를 저장할 배열


function preload() {
    // 필요한 이미지나 스프라이트를 로드합니다.
}

function create() {
    const boardSize = 9;
    // 보드판 그리기
    for (let row = 0; row < boardSize; row++) {
        for (let col = 0; col < boardSize; col++) {
            const x = col * cellSize;
            const y = row * cellSize;
            this.add.rectangle(x + cellSize / 2, y + cellSize / 2, cellSize, cellSize, 0xffffff).setStrokeStyle(2, 0x000000);
        }
    }
    // 플레이어 초기 위치 설정
    player1 = this.add.circle(270, 30, 20, 0xff0000);
    player2 = this.add.circle(270, 510, 20, 0x0000ff);
    
    // 벽 드는 공간 그리기
    const wallSpaceWidth = 30;
    const wallSpaceHeight = boardSize * cellSize;
    this.add.rectangle(0, wallSpaceHeight / 2, wallSpaceWidth, wallSpaceHeight, 0x8B4513);
    this.add.rectangle(540, wallSpaceHeight / 2, wallSpaceWidth, wallSpaceHeight, 0x8B4513);
    
    // 입력 이벤트 설정
    this.input.on('pointerdown', (pointer) => {
        if (pointer.rightButtonDown()) {
            toggleWallOrientation.call(this);
        } else {
            handlePointerDown.call(this, pointer);
        }
    });
    this.input.on('pointermove', (pointer) => {
        handlePointerMove.call(this, pointer);
    });
    this.input.on('pointerup', (pointer) => {
        handlePointerUp.call(this, pointer);
    });
}

function handlePointerDown(pointer) {
    const row = Math.floor(pointer.y / cellSize);
    const col = Math.floor(pointer.x / cellSize);
    // 클릭한 위치에 있는 말이 현재 플레이어의 말인지 확인
    const player = currentPlayer === 1 ? player1 : player2;
    // 클릭한 위치에 말이 있는 경우
    if (Phaser.Math.Distance.Between(pointer.x, pointer.y, player.x, player.y) < 20) {
        showValidMoves.call(this, player); // this를 명시적으로 바인딩
    } else if (validMoves.length > 0) {
        // 이동 가능한 칸을 클릭했을 경우
        const move = validMoves.find(move => move.x === col && move.y === row);
        if (move) {
            // 선택한 칸으로 말 이동
            player.x = move.x * cellSize + cellSize / 2;
            player.y = move.y * cellSize + cellSize / 2;
            // 게임 종료 조건 체크
            if (checkWinCondition(player)) {
                alert(`플레이어 ${currentPlayer}가 승리했습니다!`);
                resetGame.call(this); // 게임 초기화
            } else {
                // 턴 변경 후 이동 가능한 칸 초기화
                currentPlayer = currentPlayer === 1 ? 2 : 1;
                clearValidMoves.call(this); // this를 명시적으로 바인딩
            }
        }
    } else if (pointer.x < 30 || pointer.x > 510) {
        // 갈색 공간을 클릭했을 경우
        isPlacingWall = true; // 벽을 드는 상태로 변경
    }
}

function handlePointerMove(pointer) {
    if (isPlacingWall) {
        // 벽의 위치를 마우스에 따라 이동
        clearWallIndicators.call(this); // 이전 벽 표시 제거
        const cellX = Math.floor(pointer.x / cellSize);
        const cellY = Math.floor(pointer.y / cellSize);
        if (wallOrientation === 'horizontal') {
            // 가로 벽 표시 (2칸 길이)
            if (cellX >= 0 && cellX < 8 && cellY >= 0 && cellY < 9) { // 2칸 길이이므로 cellX < 8
                const wallIndicator = this.add.rectangle((cellX * cellSize) + (cellSize), (cellY * cellSize) + (cellSize), cellSize * 2, 10, 0x8B4513, 0.5);
                wallIndicators.push(wallIndicator);
            }
        } else {
            // 세로 벽 표시 (2칸 길이)
            if (cellX >= 0 && cellX < 9 && cellY >= 0 && cellY < 8) { // 2칸 길이이므로 cellY < 8
                const wallIndicator = this.add.rectangle((cellX * cellSize) + (cellSize), (cellY * cellSize) + (cellSize), 10, cellSize * 2, 0x8B4513, 0.5);
                wallIndicators.push(wallIndicator);
            }
        }
    }
}

function handlePointerUp(pointer) {
    if (isPlacingWall) {
        const cellX = Math.floor(pointer.x / cellSize);
        const cellY = Math.floor(pointer.y / cellSize);
        if (wallOrientation === 'horizontal') {
            if (cellY >= 0 && cellY < 8 && cellX >= 0 && cellX < 8) {
                const wall = {
                    x: cellX,
                    y: cellY,
                    orientation: 'horizontal'
                };
                walls.push(wall); // 설치한 벽을 저장
                this.add.rectangle((cellX * cellSize) + (cellSize), (cellY * cellSize) + (cellSize), cellSize * 2, 10, 0x8B4513);
                console.log(`가로 벽이 (${cellX}, ${cellY})에 설치되었습니다.`);
            }
        } else {
            if (cellY >= 0 && cellY < 8 && cellX >= 0 && cellX < 9) {
                const wall = {
                    x: cellX,
                    y: cellY,
                    orientation: 'vertical'
                };
                walls.push(wall); // 설치한 벽을 저장
                this.add.rectangle((cellX * cellSize) + (cellSize), (cellY * cellSize) + (cellSize), 10, cellSize * 2, 0x8B4513);
                console.log(`세로 벽이 (${cellX}, ${cellY})에 설치되었습니다.`);
            }
        }
        clearWallIndicators.call(this);
        isPlacingWall = false;
    }
}

function isMoveValid(startX, startY, endX, endY) {
    // 이동 경로에 벽이 있는지 확인
    for (let wall of walls) {
        if (wall.orientation === 'horizontal') {
            if (wall.y === startY && ((wall.x === startX && endX === startX) || (wall.x === endX && startX === endX))) {
                return false; // 가로 벽이 이동 경로에 있음
            }
        } else {
            if (wall.x === startX && ((wall.y === startY && endY === startY) || (wall.y === endY && startY === endY))) {
                return false; // 세로 벽이 이동 경로에 있음
            }
        }
    }
    return true; // 이동 가능
}

function showValidMoves(player) {
    clearValidMoves.call(this); // 이전 이동 표시 제거
    const playerX = Math.floor(player.x / cellSize);
    const playerY = Math.floor(player.y / cellSize);
    const opponent = currentPlayer === 1 ? player2 : player1; // 상대 플레이어
    const possibleMoves = [
        { x: playerX, y: playerY - 1 }, // 위
        { x: playerX, y: playerY + 1 }, // 아래
        { x: playerX - 1, y: playerY }, // 왼쪽
        { x: playerX + 1, y: playerY }  // 오른쪽
    ];
    
    validMoves = [];
    possibleMoves.forEach(move => {
        if (move.x >= 0 && move.x < 9 && move.y >= 0 && move.y < 9) {
            if (move.x === Math.floor(opponent.x / cellSize) && move.y === Math.floor(opponent.y / cellSize)) {
                const furtherMove = {
                    x: move.x + (move.x === playerX ? 0 : (move.x < playerX ? -1 : 1)),
                    y: move.y + (move.y === playerY ? 0 : (move.y < playerY ? -1 : 1))
                };
                if (furtherMove.x >= 0 && furtherMove.x < 9 && furtherMove.y >= 0 && furtherMove.y < 9) {
                    if (isMoveValid(playerX, playerY, furtherMove.x, furtherMove.y)) {
                        validMoves.push(furtherMove);
                        const indicator = this.add.rectangle(furtherMove.x * cellSize + cellSize / 2, furtherMove.y * cellSize + cellSize / 2, cellSize, cellSize, 0x00ff00, 0.5);
                        moveIndicators.push(indicator);
                    }
                }
            } else {
                if (isMoveValid(playerX, playerY, move.x, move.y)) {
                    validMoves.push(move);
                    const indicator = this.add.rectangle(move.x * cellSize + cellSize / 2, move.y * cellSize + cellSize / 2, cellSize, cellSize, 0x00ff00, 0.5);
                    moveIndicators.push(indicator);
                }
            }
        }
    });
}

function toggleWallOrientation() {
    wallOrientation = (wallOrientation === 'horizontal') ? 'vertical' : 'horizontal'; // 방향 전환
    console.log(`벽 방향이 ${wallOrientation}로 변경되었습니다.`);
}

function clearValidMoves() {
    validMoves = []; // 이동 가능한 칸 초기화
    // 이전에 표시된 이동 가능한 칸 제거
    moveIndicators.forEach(indicator => {
        indicator.destroy(); // Phaser의 destroy 메서드를 사용하여 제거
    });
    moveIndicators = []; // 표시 배열 초기화
}

function clearWallIndicators() {
    wallIndicators.forEach(indicator => {
        indicator.destroy(); // Phaser의 destroy 메서드를 사용하여 제거
    });
    wallIndicators = []; // 표시 배열 초기화
}

function checkWinCondition(player) {
    const playerY = Math.floor(player.y / cellSize);
    // 플레이어 1이 아래쪽 끝에 도달했을 때
    if (currentPlayer === 1 && playerY === 8) {
        return true; // 승리
    }
    // 플레이어 2가 위쪽 끝에 도달했을 때
    if (currentPlayer === 2 && playerY === 0) {
        return true; // 승리
    }
    return false; // 승리하지 않음
}

function resetGame() {
    // 게임 상태 초기화 로직
    player1.x = 270; // 초기 위치로 되돌리기
    player1.y = 30;
    player2.x = 270; // 초기 위치로 되돌리기
    player2.y = 510;
    currentPlayer = 1; // 플레이어 1부터 시작
    clearValidMoves.call(this); // 이동 가능한 칸 초기화
    clearWallIndicators.call(this); // 벽 표시 초기화
}

function update() {
    // 게임 로직 업데이트
}