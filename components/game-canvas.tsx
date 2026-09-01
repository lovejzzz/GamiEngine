'use client';

import { useEffect, useRef } from 'react';
import { buildingScene } from '@/engine/demo-scene';
import { circleHitsRect, nearestFloorIndex, pointToDoor, pushDoor, updateDoor, type RuntimeDoor } from '@/engine/runtime';

type Props = {
  floorIndex: number;
  paused: boolean;
  showPhysics: boolean;
  nightVision: boolean;
  onFloorChange: (index: number) => void;
  onStatus: (label: string) => void;
};

const keys = new Set<string>();

export function GameCanvas({ floorIndex, paused, showPhysics, nightVision, onFloorChange, onStatus }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef({ paused, showPhysics, nightVision, onFloorChange, onStatus });
  useEffect(() => { stateRef.current = { paused, showPhysics, nightVision, onFloorChange, onStatus }; }, [paused, showPhysics, nightVision, onFloorChange, onStatus]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    const floor = buildingScene.floors[floorIndex];
    const floorTexture = new Image();
    floorTexture.src = '/assets/floor-oak.png';
    const operatorAtlas = new Image();
    operatorAtlas.src = '/assets/operator-walk-4x4-rgba.png';
    const residentImage = new Image();
    residentImage.src = '/assets/character-explorer.png';
    const player = { ...floor.spawn, radius: 17, directionRow: 0, moving: false };
    const doors: RuntimeDoor[] = floor.doors.map((spec) => ({
      id: spec.id,
      name: spec.name,
      hinge: { ...spec.hinge },
      length: spec.length,
      width: spec.width,
      angle: spec.closedAngle,
      angularVelocity: 0,
      minAngle: spec.minAngle,
      maxAngle: spec.maxAngle,
      motorTarget: null,
    }));
    let frameRequest = 0;
    let previous = performance.now();
    let dpr = 1;
    let floorPattern: CanvasPattern | null = null;
    let stairCooldown = false;

    const useStairs = (direction: 1 | -1) => {
      const stairs = floor.stairs;
      const nearStairs = circleHitsRect(player, 44, stairs);
      const targetId = direction === 1 ? stairs.toUp : stairs.toDown;
      if (!nearStairs) {
        stateRef.current.onStatus('先走到绿色楼梯区域，再按 R/F 换层');
        return;
      }
      if (!targetId) {
        stateRef.current.onStatus(direction === 1 ? '上方没有楼层' : '下方没有楼层');
        return;
      }
      const target = nearestFloorIndex(floorIndex, direction, buildingScene.floors.length);
      stateRef.current.onStatus(`楼梯流送：${floor.name} → ${buildingScene.floors[target].name}`);
      stateRef.current.onFloorChange(target);
    };

    const keyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd', 'e', 'r', 'f'].includes(key)) event.preventDefault();
      keys.add(key);
      if (event.repeat) return;
      if (key === 'e') {
        const nearby = doors
          .map((item) => ({ item, distance: Math.hypot(player.x - item.hinge.x, player.y - item.hinge.y) }))
          .filter(({ distance }) => distance < 112)
          .sort((a, b) => a.distance - b.distance)[0];
        if (!nearby) stateRef.current.onStatus('附近没有可操作的门');
        else {
          const item = nearby.item;
          const nearMin = Math.abs(item.angle - item.minAngle) < Math.abs(item.angle - item.maxAngle);
          item.motorTarget = nearMin ? item.maxAngle : item.minAngle;
          stateRef.current.onStatus(`${item.name}：门轴马达 ${nearMin ? '打开' : '关闭'}`);
        }
      }
      if (!stairCooldown && key === 'r') { stairCooldown = true; useStairs(1); }
      if (!stairCooldown && key === 'f') { stairCooldown = true; useStairs(-1); }
    };
    const keyUp = (event: KeyboardEvent) => {
      keys.delete(event.key.toLowerCase());
      if (event.key.toLowerCase() === 'r' || event.key.toLowerCase() === 'f') stairCooldown = false;
    };
    window.addEventListener('keydown', keyDown);
    window.addEventListener('keyup', keyUp);

    const drawFurniture = () => {
      for (const room of floor.rooms) {
        context.save();
        context.shadowColor = 'rgba(0,0,0,.38)';
        context.shadowBlur = 10;
        context.shadowOffsetY = 6;
        if (room.purpose === 'bedroom' || room.purpose === 'nursery') {
          context.fillStyle = room.purpose === 'nursery' ? '#766e58' : '#505953';
          context.beginPath();
          context.roundRect(room.x + 30, room.y + 42, Math.min(120, room.width - 60), 82, 8);
          context.fill();
          context.fillStyle = '#9b927f';
          context.fillRect(room.x + 39, room.y + 50, Math.min(102, room.width - 78), 28);
        } else if (room.purpose === 'living') {
          context.fillStyle = '#4d5d55';
          context.beginPath();
          context.roundRect(room.x + 42, room.y + 48, 160, 62, 14);
          context.fill();
        } else if (room.purpose === 'kitchen') {
          context.fillStyle = '#73766c';
          context.fillRect(room.x + room.width - 42, room.y + 20, 30, room.height - 40);
          context.fillStyle = '#8b8d82';
          context.fillRect(room.x + 22, room.y + 22, room.width - 76, 34);
        } else if (room.purpose === 'dining' || room.purpose === 'studio') {
          context.fillStyle = '#634936';
          context.beginPath();
          context.ellipse(room.x + room.width * .6, room.y + room.height * .52, 70, 38, 0, 0, Math.PI * 2);
          context.fill();
        } else if (room.purpose === 'storage' || room.purpose === 'utility') {
          context.fillStyle = '#4e5049';
          for (let i = 0; i < 3; i += 1) context.fillRect(room.x + 32 + i * 66, room.y + 42, 46, 72);
        }
        context.restore();
      }
    };

    const drawDoor = (item: RuntimeDoor) => {
      context.save();
      context.translate(item.hinge.x, item.hinge.y);
      context.rotate(item.angle);
      context.shadowColor = 'rgba(0,0,0,.48)';
      context.shadowBlur = 12;
      context.shadowOffsetY = 6;
      const gradient = context.createLinearGradient(0, -item.width / 2, 0, item.width / 2);
      gradient.addColorStop(0, '#b4afa2');
      gradient.addColorStop(.42, '#77766f');
      gradient.addColorStop(1, '#4d4f4a');
      context.fillStyle = gradient;
      context.beginPath();
      context.roundRect(0, -item.width / 2, item.length, item.width, 2);
      context.fill();
      context.shadowColor = 'transparent';
      context.fillStyle = '#b79a56';
      context.beginPath();
      context.arc(item.length - 11, 0, 2.4, 0, Math.PI * 2);
      context.fill();
      if (stateRef.current.showPhysics) {
        context.strokeStyle = '#5df3a5';
        context.lineWidth = 1.5;
        context.strokeRect(0, -item.width / 2 - 3, item.length, item.width + 6);
        context.fillStyle = '#5df3a5';
        context.beginPath();
        context.arc(0, 0, 5, 0, Math.PI * 2);
        context.fill();
      }
      context.restore();
    };

    const drawOccupant = (occupant: typeof floor.occupants[number], index: number) => {
      const pulse = Math.sin(performance.now() / 620 + index) * 1.5;
      context.save();
      context.translate(occupant.position.x, occupant.position.y);
      context.rotate(occupant.facing);
      context.globalAlpha = occupant.behavior === 'hiding' ? .68 : .94;
      if (residentImage.complete) context.drawImage(residentImage, -22, -26 + pulse, 44, 44);
      else {
        context.fillStyle = '#6f7468';
        context.beginPath();
        context.arc(0, 0, 14, 0, Math.PI * 2);
        context.fill();
      }
      context.restore();
      if (stateRef.current.showPhysics) {
        context.fillStyle = occupant.role === 'hostile' ? '#ff6f66' : occupant.role === 'civilian' ? '#73d9ff' : '#f3c56b';
        context.beginPath();
        context.arc(occupant.position.x, occupant.position.y - 26, 4, 0, Math.PI * 2);
        context.fill();
      }
    };

    const render = (now: number) => {
      const dt = Math.min((now - previous) / 1000, .035);
      previous = now;
      const cssWidth = canvas.clientWidth;
      const cssHeight = canvas.clientHeight;
      const scale = Math.min(cssWidth / buildingScene.world.width, cssHeight / buildingScene.world.height);
      const offsetX = (cssWidth - buildingScene.world.width * scale) / 2;
      const offsetY = (cssHeight - buildingScene.world.height * scale) / 2;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, cssWidth, cssHeight);
      context.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * offsetX, dpr * offsetY);
      context.fillStyle = '#111512';
      context.fillRect(0, 0, buildingScene.world.width, buildingScene.world.height);
      context.fillStyle = '#20251f';
      context.fillRect(52, 22, 856, 576);

      if (!floorPattern && floorTexture.complete) floorPattern = context.createPattern(floorTexture, 'repeat');
      for (const room of floor.rooms) {
        context.fillStyle = room.floorAsset === 'floor.oak' && floorPattern ? floorPattern : '#504f49';
        context.fillRect(room.x, room.y, room.width, room.height);
        context.fillStyle = room.tint;
        context.fillRect(room.x, room.y, room.width, room.height);
        context.fillStyle = 'rgba(224,232,219,.62)';
        context.font = '600 11px ui-monospace, monospace';
        context.fillText(room.name.toUpperCase(), room.x + 15, room.y + 22);
      }
      drawFurniture();

      context.fillStyle = 'rgba(43,88,65,.34)';
      context.fillRect(floor.stairs.x, floor.stairs.y, floor.stairs.width, floor.stairs.height);
      context.strokeStyle = 'rgba(100,244,164,.65)';
      context.lineWidth = 1.5;
      for (let y = floor.stairs.y + 9; y < floor.stairs.y + floor.stairs.height; y += 13) {
        context.beginPath();
        context.moveTo(floor.stairs.x + 8, y);
        context.lineTo(floor.stairs.x + floor.stairs.width - 8, y);
        context.stroke();
      }

      context.shadowColor = 'rgba(0,0,0,.55)';
      context.shadowBlur = 16;
      context.shadowOffsetY = 8;
      for (const wall of floor.walls) {
        const wallGradient = context.createLinearGradient(wall.x, wall.y, wall.x, wall.y + wall.height);
        wallGradient.addColorStop(0, '#b4b1a7');
        wallGradient.addColorStop(1, '#6c706a');
        context.fillStyle = wallGradient;
        context.fillRect(wall.x, wall.y, wall.width, wall.height);
        context.fillStyle = 'rgba(255,255,255,.18)';
        context.fillRect(wall.x + 2, wall.y + 2, Math.max(0, wall.width - 4), 2);
      }
      context.shadowColor = 'transparent';

      if (!stateRef.current.paused) {
        let x = 0;
        let y = 0;
        if (keys.has('w') || keys.has('arrowup')) y -= 1;
        if (keys.has('s') || keys.has('arrowdown')) y += 1;
        if (keys.has('a') || keys.has('arrowleft')) x -= 1;
        if (keys.has('d') || keys.has('arrowright')) x += 1;
        player.moving = Boolean(x || y);
        const length = Math.hypot(x, y) || 1;
        const velocity = { x: x / length * 148, y: y / length * 148 };
        if (Math.abs(x) > Math.abs(y)) player.directionRow = x > 0 ? 1 : 3;
        else if (y) player.directionRow = y > 0 ? 2 : 0;
        const proposed = { x: player.x + velocity.x * dt, y: player.y + velocity.y * dt };
        const hitsWall = floor.walls.some((wall) => circleHitsRect(proposed, player.radius, wall));
        let pushed = false;
        for (const item of doors) {
          if (player.moving) pushed = pushDoor(item, proposed, velocity) || pushed;
          updateDoor(item, dt);
        }
        const blockedDoor = doors.some((item) => pointToDoor(proposed, item).distance < player.radius + item.width / 2 - 1);
        if (!hitsWall && (!blockedDoor || pushed)) {
          player.x = proposed.x;
          player.y = proposed.y;
        }
        if (pushed) stateRef.current.onStatus('人物接触门板：已根据力臂计算门轴扭矩');
      }

      doors.forEach(drawDoor);
      floor.occupants.forEach(drawOccupant);

      context.save();
      context.translate(player.x, player.y);
      context.shadowColor = 'rgba(0,0,0,.55)';
      context.shadowBlur = 12;
      context.shadowOffsetY = 7;
      if (operatorAtlas.complete) {
        const frameWidth = operatorAtlas.naturalWidth / 4;
        const frameHeight = operatorAtlas.naturalHeight / 4;
        const frame = player.moving ? Math.floor(now / 125) % 4 : 0;
        context.drawImage(operatorAtlas, frame * frameWidth, player.directionRow * frameHeight, frameWidth, frameHeight, -31, -38, 62, 76);
      } else {
        context.fillStyle = '#182b23';
        context.beginPath();
        context.arc(0, 0, player.radius, 0, Math.PI * 2);
        context.fill();
      }
      if (stateRef.current.showPhysics) {
        context.shadowColor = 'transparent';
        context.strokeStyle = '#5df3a5';
        context.lineWidth = 1.5;
        context.beginPath();
        context.arc(0, 0, player.radius, 0, Math.PI * 2);
        context.stroke();
      }
      context.restore();

      const darkness = context.createRadialGradient(player.x, player.y, 55, player.x, player.y, stateRef.current.nightVision ? 450 : 255);
      if (stateRef.current.nightVision) {
        darkness.addColorStop(0, 'rgba(8,33,18,.02)');
        darkness.addColorStop(.65, 'rgba(5,25,13,.18)');
        darkness.addColorStop(1, 'rgba(1,9,4,.42)');
      } else {
        darkness.addColorStop(0, 'rgba(0,0,0,.02)');
        darkness.addColorStop(.52, 'rgba(0,0,0,.37)');
        darkness.addColorStop(1, 'rgba(0,0,0,.82)');
      }
      context.fillStyle = darkness;
      context.fillRect(0, 0, buildingScene.world.width, buildingScene.world.height);
      if (stateRef.current.nightVision) {
        context.fillStyle = 'rgba(48,143,78,.14)';
        context.fillRect(0, 0, buildingScene.world.width, buildingScene.world.height);
      }

      frameRequest = requestAnimationFrame(render);
    };

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(canvas.clientWidth * dpr));
      canvas.height = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    frameRequest = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(frameRequest);
      observer.disconnect();
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('keyup', keyUp);
      keys.clear();
    };
  }, [floorIndex]);

  return <canvas ref={canvasRef} className="game-canvas" aria-label="可玩的原创四层战术住宅俯视场景。WASD 移动，E 开门，R/F 上下楼。" />;
}
