'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  Boxes, Braces, Building2, Check, ChevronRight, CirclePause, CirclePlay,
  Cuboid, DoorOpen, Download, Eye, Footprints, Grid3X3, Image as ImageIcon,
  Layers3, LoaderCircle, Moon, Sparkles, Sun, UserRound, WandSparkles,
} from 'lucide-react';
import { GameCanvas } from './game-canvas';
import { buildingScene } from '@/engine/demo-scene';
import type { AssetRecipe } from '@/engine/types';

const kindIcon = {
  tile: Grid3X3,
  'wall-face': Layers3,
  'door-face': DoorOpen,
  prop: Cuboid,
  character: UserRound,
};

export function GameEngineStudio() {
  const [floorIndex, setFloorIndex] = useState(1);
  const [selectedId, setSelectedId] = useState('character.operator');
  const [paused, setPaused] = useState(false);
  const [showPhysics, setShowPhysics] = useState(false);
  const [nightVision, setNightVision] = useState(true);
  const [status, setStatus] = useState('WASD 移动 · E 开门 · 在楼梯区域按 R/F 上下楼');
  const [generating, setGenerating] = useState(false);
  const [notice, setNotice] = useState('');
  const floor = buildingScene.floors[floorIndex];
  const selected = useMemo(
    () => buildingScene.assets.find((asset) => asset.id === selectedId) ?? buildingScene.assets[0],
    [selectedId],
  );

  const changeFloor = useCallback((index: number) => {
    setFloorIndex(index);
  }, []);
  const changeStatus = useCallback((value: string) => setStatus(value), []);

  const exportScene = () => {
    const blob = new Blob([JSON.stringify(buildingScene, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'no-47-townhouse.scene.json';
    link.click();
    URL.revokeObjectURL(link.href);
    setNotice('建筑场景 JSON 已导出。图片可以替换，楼层、门轴和住户状态不会丢。');
  };

  const generateAsset = async (asset: AssetRecipe) => {
    setGenerating(true);
    setNotice('正在提交独立资产配方…');
    try {
      const response = await fetch('/api/assets/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ assetId: asset.id, kind: asset.kind, prompt: asset.prompt, styleLock: buildingScene.styleLock }),
      });
      const data = await response.json() as { image?: string; message?: string };
      if (!response.ok || !data.image) throw new Error(data.message ?? '生成服务暂不可用');
      const link = document.createElement('a');
      link.href = data.image;
      link.download = `${asset.id}.png`;
      link.click();
      setNotice('资产已生成。把文件路径写入 manifest 的 source 即可替换。');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '生成失败');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <main className="studio-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <span className="brand-mark"><Boxes size={18} /></span>
          <div><strong>FRAME</strong><span>GPT SCENE ENGINE</span></div>
        </div>
        <nav className="mode-switch" aria-label="工作模式">
          <button className="active"><Building2 size={14} /> 建筑</button>
          <button><ImageIcon size={14} /> 资产</button>
          <button><Braces size={14} /> JSON</button>
        </nav>
        <div className="top-actions">
          <span className="autosave"><Check size={12} /> LOCAL</span>
          <button className="icon-button" title="导出场景" onClick={exportScene}><Download size={17} /></button>
          <button className="run-button" onClick={() => setPaused((value) => !value)}>
            {paused ? <CirclePlay size={16} /> : <CirclePause size={16} />}{paused ? '运行' : '暂停'}
          </button>
        </div>
      </header>

      <section className="workspace">
        <aside className="scene-panel panel">
          <div className="panel-heading"><span>BUILDING GRAPH</span><button title="建筑层级"><Layers3 size={15} /></button></div>
          <div className="scene-title"><span className="scene-dot" /><div><strong>{buildingScene.name}</strong><small>building.v1 · 4 streamed floors</small></div></div>
          <div className="floor-stack" aria-label="楼层选择">
            {[...buildingScene.floors].reverse().map((item) => (
              <button key={item.id} className={floor.id === item.id ? 'floor-row active' : 'floor-row'} onClick={() => setFloorIndex(item.index)}>
                <span>{item.name}</span><div><strong>{item.subtitle}</strong><small>{item.rooms.length} rooms · {item.occupants.length} occupants</small></div><ChevronRight size={14} />
              </button>
            ))}
          </div>
          <div className="tree compact-tree">
            <TreeGroup label="CURRENT FLOOR" count={floor.rooms.length}>
              {floor.rooms.map((room) => <TreeItem key={room.id} label={room.name} detail={room.purpose} />)}
            </TreeGroup>
            <TreeGroup label="PHYSICS" count={floor.walls.length + floor.doors.length}>
              <TreeItem label="墙体" detail={`${floor.walls.length} static colliders`} />
              <TreeItem label="可推门" detail={`${floor.doors.length} hinge bodies`} accent />
            </TreeGroup>
            <TreeGroup label="OCCUPANTS" count={floor.occupants.length}>
              {floor.occupants.map((person) => <TreeItem key={person.id} label={person.name} detail={`${person.role} · ${person.behavior}`} accent={person.role === 'unknown'} />)}
            </TreeGroup>
          </div>
          <div className="principle-card">
            <span><Sparkles size={14} /> 分离原则</span>
            <p>GPT 负责像素；建筑尺寸、门轴、动画、AI、灯光与材质穿透由结构化数据控制。</p>
          </div>
        </aside>

        <section className="viewport-panel">
          <div className="viewport-toolbar">
            <div><span className="live-dot" /> LIVE · {floor.name} <b>60 FPS</b></div>
            <div>
              <button className={nightVision ? 'active' : ''} onClick={() => setNightVision((value) => !value)}>{nightVision ? <Moon size={14} /> : <Sun size={14} />} NV</button>
              <button className={showPhysics ? 'active' : ''} onClick={() => setShowPhysics((value) => !value)}><Eye size={14} /> 碰撞</button>
            </div>
          </div>
          <div className="canvas-wrap">
            <GameCanvas floorIndex={floorIndex} paused={paused} showPhysics={showPhysics} nightVision={nightVision} onFloorChange={changeFloor} onStatus={changeStatus} />
            <div className="floor-badge"><span>{floor.name}</span><p>{floor.subtitle}</p></div>
            <div className="play-hint"><kbd>WASD</kbd><span>移动</span><kbd>E</kbd><span>门</span><kbd>R/F</kbd><span>楼层</span></div>
            <div className="physics-status"><Footprints size={14} /><p>{status}</p></div>
          </div>
          <div className="viewport-footer">
            <span>CAMERA <b>ORTHO · 90°</b></span>
            <span>STREAM <b>{floor.id.toUpperCase()} ACTIVE</b></span>
            <span>PLAYER <b>4 × 4 / 8 FPS</b></span>
          </div>
        </section>

        <aside className="asset-panel panel">
          <div className="panel-heading"><span>ASSET LAB</span><span className="asset-count">{buildingScene.assets.length}</span></div>
          <div className="style-lock">
            <div><WandSparkles size={16} /><span><strong>视觉一致性锁</strong><small>{buildingScene.styleLock.id}</small></span></div>
            <span className="lock-state">LOCKED</span>
          </div>
          <div className="asset-list">
            {buildingScene.assets.map((asset) => {
              const Icon = kindIcon[asset.kind];
              return (
                <button key={asset.id} className={selected.id === asset.id ? 'asset-row selected' : 'asset-row'} onClick={() => setSelectedId(asset.id)}>
                  <span className="asset-thumb">{asset.source ? <img src={asset.source} alt="" /> : <Icon size={17} />}</span>
                  <span className="asset-copy"><strong>{asset.name}</strong><small>{asset.atlas ? `${asset.atlas.columns * asset.atlas.rows} frames` : `${asset.kind} · ${asset.side ?? 'top'}`}</small></span>
                  <span className={asset.state === 'ready' ? 'asset-state ready' : 'asset-state recipe'}>{asset.state === 'ready' ? 'READY' : 'RECIPE'}</span>
                </button>
              );
            })}
          </div>
          <div className="asset-inspector">
            <div className="inspector-title"><span>SELECTED RECIPE</span><b>{selected.id}</b></div>
            <p>{selected.description}</p>
            <div className="metrics">
              <span><small>物理尺寸</small><b>{selected.physicalSize.x} × {selected.physicalSize.y}m</b></span>
              <span><small>{selected.atlas ? '动画' : 'Pivot'}</small><b>{selected.atlas ? `${selected.atlas.columns}×${selected.atlas.rows} @ ${selected.atlas.fps}` : `${selected.pivot.x}, ${selected.pivot.y}`}</b></span>
            </div>
            <div className="prompt-preview">{selected.prompt}</div>
            <button className="generate-button" disabled={generating} onClick={() => generateAsset(selected)}>
              {generating ? <LoaderCircle className="spin" size={16} /> : selected.atlas ? <Footprints size={16} /> : <Sparkles size={16} />}
              {generating ? '生成中…' : selected.state === 'ready' ? '重新生成这个部件' : '生成这个部件'}
            </button>
            {notice && <output className="notice">{notice}</output>}
          </div>
        </aside>
      </section>
    </main>
  );
}

function TreeGroup({ label, count, children }: { label: string; count: number; children: React.ReactNode }) {
  return <div className="tree-group"><div className="tree-group-label"><span><ChevronRight size={12} /> {label}</span><b>{count}</b></div>{children}</div>;
}

function TreeItem({ label, detail, accent = false }: { label: string; detail: string; accent?: boolean }) {
  return <div className="tree-item"><span className={accent ? 'node accent' : 'node'} /><div><strong>{label}</strong><small>{detail}</small></div></div>;
}
