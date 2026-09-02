'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  Boxes, Braces, Building2, Camera, Check, ChevronRight, CirclePause, CirclePlay,
  Cuboid, DoorOpen, Download, Eye, Footprints, Gamepad2, Grid3X3, Image as ImageIcon,
  Layers3, LoaderCircle, Maximize2, Minimize2, Moon, ScanSearch, ShieldCheck, Sparkles, Sun, UserRound, WandSparkles,
} from 'lucide-react';
import { GameCanvas, type CameraMode } from './game-canvas';
import { buildingScene } from '@/engine/demo-scene';
import { auditAssetQuality, auditSceneQuality } from '@/engine/asset-quality';
import type { AssetRecipe } from '@/engine/types';
import type { VisualIntelligenceReport } from '@/engine/visual-intelligence';

const kindIcon = {
  tile: Grid3X3,
  'wall-face': Layers3,
  'door-face': DoorOpen,
  prop: Cuboid,
  character: UserRound,
  animation: Footprints,
  material: ImageIcon,
};

export function GameEngineStudio() {
  const [floorIndex, setFloorIndex] = useState(1);
  const [selectedId, setSelectedId] = useState('reference.townhouse-art-direction-v1');
  const [paused, setPaused] = useState(false);
  const [showPhysics, setShowPhysics] = useState(false);
  const [nightVision, setNightVision] = useState(false);
  const [cameraMode, setCameraMode] = useState<CameraMode>('editor');
  const [cinematic, setCinematic] = useState(true);
  const [status, setStatus] = useState('WASD 移动 · E 开门 · Q 互动 · 走入楼梯并沿踏步上下楼');
  const [generating, setGenerating] = useState(false);
  const [notice, setNotice] = useState('');
  const [visualProbeOpen, setVisualProbeOpen] = useState(false);
  const [visualReport, setVisualReport] = useState<VisualIntelligenceReport | null>(null);
  const floor = buildingScene.floors[floorIndex];
  const selected = useMemo(
    () => buildingScene.assets.find((asset) => asset.id === selectedId) ?? buildingScene.assets[0],
    [selectedId],
  );
  const qualityAudit = useMemo(
    () => selected.geometry?.qualityTier ? auditAssetQuality(selected, buildingScene.assets) : null,
    [selected],
  );
  const sceneQuality = useMemo(() => auditSceneQuality(buildingScene), []);

  const changeFloor = useCallback((index: number) => {
    setFloorIndex(index);
  }, []);
  const changeStatus = useCallback((value: string) => setStatus(value), []);
  const changeVisualReport = useCallback((value: VisualIntelligenceReport) => setVisualReport(value), []);

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
        body: JSON.stringify({ assetId: asset.id, kind: asset.kind, usage: asset.usage, prompt: asset.prompt, styleLock: buildingScene.styleLock }),
      });
      const data = await response.json() as { image?: string; message?: string };
      if (!response.ok || !data.image) throw new Error(data.message ?? '生成服务暂不可用');
      const link = document.createElement('a');
      link.href = data.image;
      link.download = `${asset.id}.png`;
      link.click();
      setNotice(asset.usage === 'reference-study'
        ? '参考图已生成。先提取轮廓、比例和材质分区，再重建 Mesh；不要把整张图直接贴进运行时。'
        : '材质已生成。验证无缝和平光后，把路径写入 manifest 的 source。');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '生成失败');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <main className={cinematic ? 'studio-shell cinematic' : 'studio-shell'}>
      <header className="topbar">
        <div className="brand-lockup">
          <span className="brand-mark"><Boxes size={18} /></span>
          <div><strong>GAMI</strong><span>3D SCENE ENGINE</span></div>
        </div>
        <nav className="mode-switch" aria-label="工作模式">
          <button className="active"><Gamepad2 size={14} /> DEMO</button>
          <button><Building2 size={14} /> 场景</button>
          <button><ImageIcon size={14} /> 材质</button>
          <button><Braces size={14} /> JSON</button>
        </nav>
        <div className="top-actions">
          <span className={`craft-status ${sceneQuality.stage}`}><ShieldCheck size={12} /> CRAFT {sceneQuality.score} · {sceneQuality.stage.toUpperCase()}</span>
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
          <div className="scene-title"><span className="scene-dot" /><div><strong>{buildingScene.name}</strong><small>Gami Engine · Three.js · 4 streamed floors</small></div></div>
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
            <TreeGroup label="PHYSICS" count={floor.walls.length + (floor.obstacles?.length ?? 0) + floor.doors.length + floor.props.filter((prop) => prop.collider?.blocksMovement !== false).length + floor.occupants.filter((person) => person.collider?.blocksMovement).length}>
              <TreeItem label="墙体" detail={`${floor.walls.length} static colliders`} />
              <TreeItem label="固定物" detail={`${floor.obstacles?.length ?? 0} fixture colliders`} />
              <TreeItem label="家具 / 人物" detail={`${floor.props.filter((prop) => prop.collider?.blocksMovement !== false).length + floor.occupants.filter((person) => person.collider?.blocksMovement).length} dynamic colliders`} />
              <TreeItem label="可推门" detail={`${floor.doors.length} hinge bodies`} accent />
            </TreeGroup>
            <TreeGroup label="INTERACTIVE PROPS" count={floor.props.length}>
              {floor.props.map((prop) => <TreeItem key={prop.id} label={prop.name} detail={`${prop.parts?.length ?? 0} 子部件 · ${prop.interaction ? '可互动' : '场景物件'}`} accent={Boolean(prop.interaction || prop.parts?.length)} />)}
            </TreeGroup>
            <TreeGroup label="OCCUPANTS" count={floor.occupants.length}>
              {floor.occupants.map((person) => <TreeItem key={person.id} label={person.name} detail={`${person.role} · ${person.behavior}`} accent={person.role === 'unknown'} />)}
            </TreeGroup>
          </div>
          <div className="principle-card">
            <span><ShieldCheck size={14} /> 作品质量原则</span>
            <p>能运行不等于完成。参考、构造、材质、互动和近景实证缺一项，资产就不能进入 Production。</p>
          </div>
        </aside>

        <section className="viewport-panel">
          <div className="viewport-toolbar">
            <div><span className="live-dot" /> LIVE · {floor.name} <b>60 FPS</b><span className={`craft-inline ${sceneQuality.stage}`}>CRAFT {sceneQuality.score} · {sceneQuality.stage.toUpperCase()}</span></div>
            <div>
              <button className={cameraMode === 'follow' ? 'active' : ''} onClick={() => setCameraMode((value) => value === 'editor' ? 'follow' : 'editor')}><Camera size={14} /> {cameraMode === 'editor' ? '俯视编辑' : '跟随游玩'}</button>
              <button className={nightVision ? 'active' : ''} onClick={() => setNightVision((value) => !value)}>{nightVision ? <Moon size={14} /> : <Sun size={14} />} NV</button>
              <button className={showPhysics ? 'active' : ''} onClick={() => setShowPhysics((value) => !value)}><Eye size={14} /> 碰撞</button>
              <button className={visualProbeOpen ? 'active' : ''} onClick={() => setVisualProbeOpen((value) => !value)}><ScanSearch size={14} /> 视觉 CI</button>
              <button className={cinematic ? 'active' : ''} aria-label={cinematic ? '退出沉浸构图' : '进入沉浸构图'} onClick={() => setCinematic((value) => !value)}>{cinematic ? <Minimize2 size={14} /> : <Maximize2 size={14} />} 构图</button>
            </div>
          </div>
          <div className="canvas-wrap">
            <GameCanvas floorIndex={floorIndex} paused={paused} showPhysics={showPhysics} nightVision={nightVision} cameraMode={cameraMode} cinematic={cinematic} onFloorChange={changeFloor} onStatus={changeStatus} onVisualReport={changeVisualReport} />
            <div className="floor-badge"><span>{floor.name}</span><p>{floor.subtitle}</p></div>
            {visualProbeOpen && <VisualProbePanel report={visualReport} />}
            <div className="play-hint"><kbd>WASD</kbd><span>移动 / 楼梯</span><kbd>E</kbd><span>门</span><kbd>Q</kbd><span>物品</span></div>
            <div className="physics-status"><Footprints size={14} /><p>{status}</p></div>
          </div>
          <div className="viewport-footer">
            <span>GAMI BACKEND <b>THREE ADAPTER · WEBGL2</b></span>
            <span>CAMERA <b>{cameraMode === 'editor' ? 'EDITOR ORBIT' : 'PLAYER FOLLOW'}</b></span>
            <span>STREAM <b>{floor.id.toUpperCase()} ACTIVE</b></span>
            <span>PLAYER <b>3D RIG</b></span>
          </div>
        </section>

        <aside className="asset-panel panel">
          <div className="panel-heading"><span>ASSET LAB</span><span className="asset-count">{buildingScene.assets.length}</span></div>
          <div className="style-lock">
            <div><WandSparkles size={16} /><span><strong>视觉一致性锁</strong><small>{buildingScene.styleLock.id}</small></span></div>
            <span className="lock-state">LOCKED</span>
          </div>
          <section className={`quality-gate-card ${sceneQuality.productionReady ? 'passed' : 'blocked'}`} aria-label="作品质量门">
            <div className="quality-gate-head">
              <span><ShieldCheck size={14} /> CRAFT GATE</span>
              <b>{sceneQuality.score}<small>/100</small></b>
            </div>
            <div className="quality-meter"><i style={{ width: `${sceneQuality.score}%` }} /></div>
            <div className="quality-gate-meta">
              <span>{sceneQuality.stage.toUpperCase()}</span>
              <small>Production ≥ {sceneQuality.threshold} · Hero {sceneQuality.heroAssets.passed}/{sceneQuality.heroAssets.total}</small>
            </div>
            <div className="quality-dimensions">
              {sceneQuality.dimensions.map((dimension) => (
                <span key={dimension.id} className={dimension.status} title={dimension.note}>
                  <i />{dimension.label}<b>{dimension.status === 'passed' ? 'PASS' : dimension.status === 'failed' ? 'FAIL' : 'WIP'}</b>
                </span>
              ))}
            </div>
            {!sceneQuality.productionReady && <p>阻断发布：{sceneQuality.blockers.map((blocker) => blocker.split('：')[0]).join(' / ')}</p>}
          </section>
          <div className="asset-list">
            {buildingScene.assets.map((asset) => {
              const Icon = kindIcon[asset.kind];
              const assetAudit = asset.geometry?.qualityTier && asset.quality ? auditAssetQuality(asset, buildingScene.assets) : null;
              const stateLabel = assetAudit ? assetAudit.ready ? 'CRAFTED' : 'BLOCKED' : asset.state === 'ready' ? 'READY' : 'RECIPE';
              return (
                <button key={asset.id} className={selected.id === asset.id ? 'asset-row selected' : 'asset-row'} onClick={() => setSelectedId(asset.id)}>
                  <span className={asset.source ? 'asset-thumb has-image' : 'asset-thumb'} style={asset.source ? { backgroundImage: `url(${asset.source})` } : undefined}>{asset.source ? null : <Icon size={17} />}</span>
                  <span className="asset-copy"><strong>{asset.name}</strong><small>{asset.atlas ? `${asset.atlas.columns * asset.atlas.rows} frames` : `${asset.usage ?? asset.kind} · ${asset.side ?? 'top'}`}</small></span>
                  <span className={`asset-state ${assetAudit ? assetAudit.ready ? 'crafted' : 'blocked' : asset.state === 'ready' ? 'ready' : 'recipe'}`}>{stateLabel}</span>
                </button>
              );
            })}
          </div>
          <div className="asset-inspector">
            <div className="inspector-title"><span>SELECTED RECIPE</span><b>{selected.id}</b></div>
            <p>{selected.description}</p>
            <div className="metrics">
              <span><small>物理尺寸</small><b>{selected.physicalSize.x} × {selected.physicalSize.y}m</b></span>
              <span><small>{qualityAudit ? '门禁证据' : selected.atlas ? '动画' : '用途'}</small><b>{qualityAudit ? `${qualityAudit.tier?.toUpperCase()} · ${qualityAudit.checks.passed}/${qualityAudit.checks.total} CHECKS` : selected.atlas ? `${selected.atlas.columns}×${selected.atlas.rows} @ ${selected.atlas.fps}` : selected.usage ?? 'recipe'}</b></span>
            </div>
            {qualityAudit && <div className={`prompt-preview quality-result ${qualityAudit.ready ? 'passed' : 'blocked'}`}>质量门禁：{qualityAudit.ready ? 'PRODUCTION READY · 有运行实证' : qualityAudit.issues.join(' / ')}</div>}
            {qualityAudit && <div className="asset-quality-dimensions">{qualityAudit.dimensions.map((dimension) => <span key={dimension.id} className={dimension.ready ? 'passed' : 'blocked'}><small>{dimension.label}</small><b>{dimension.score}</b></span>)}</div>}
            {selected.referenceStudy && <div className="prompt-preview">学习：{selected.referenceStudy.learn.join(' / ')} · 运行时规则：不直接渲染整图</div>}
            {selected.geometry && <div className="prompt-preview">建模：{selected.geometry.source}{selected.geometry.blueprintId ? ` · ${selected.geometry.blueprintId}` : ''} · {(selected.geometry.independentlyModeledParts ?? []).join(' / ')}</div>}
            {selected.pbr && <div className="prompt-preview">PBR：base-color / {selected.pbr.normalAsset ? 'normal' : '—'} / {selected.pbr.roughnessAsset ? 'roughness' : '—'} · {selected.pbr.texelDensityPxPerMeter}px/m</div>}
            {selected.quality?.craft && <div className="prompt-preview">构造签名：{selected.quality.craft.signatureParts.join(' / ')} · 拓扑：{selected.quality.craft.topologyTechniques.join(' / ')} · 证据：{selected.quality.craft.review.evidence.length}</div>}
            {selected.animation && <div className="prompt-preview">动画：{selected.animation.skeleton} · {selected.animation.clips.map((clip) => `${clip.id}:${clip.status === 'implemented' ? '✓' : '待做'}`).join(' / ')}</div>}
            {selected.texture && <div className="prompt-preview">贴图：{selected.texture.semantic} · {selected.texture.tileable ? '无缝平铺' : '单次映射'} · {selected.texture.metersPerTile.x}m/块</div>}
            {selected.interaction && <div className="prompt-preview">交互：{selected.interaction.actions.join(' / ')} · {selected.interaction.states.map((state) => state.label).join(' → ')}</div>}
            <div className="prompt-preview">{selected.prompt}</div>
            <button className="generate-button" disabled={generating} onClick={() => generateAsset(selected)}>
              {generating ? <LoaderCircle className="spin" size={16} /> : selected.atlas ? <Footprints size={16} /> : <Sparkles size={16} />}
              {generating ? '生成中…' : `${selected.state === 'ready' ? '重新生成' : '生成'}${selected.usage === 'reference-study' ? '参考图' : selected.usage === 'runtime-texture' ? '材质' : '资产'}`}
            </button>
            {notice && <output className="notice">{notice}</output>}
          </div>
        </aside>
      </section>
    </main>
  );
}

function VisualProbePanel({ report }: { report: VisualIntelligenceReport | null }) {
  if (!report) return <aside className="visual-ci-panel loading"><span>VISUAL CI · LIVE PROBE</span><p>正在采样最终渲染帧…</p></aside>;
  const automated = report.checks.filter((check) => check.status !== 'human-required');
  const human = report.checks.filter((check) => check.status === 'human-required');
  const ratio = (value: number) => `${Math.round(value * 100)}%`;
  return (
    <aside className="visual-ci-panel" aria-label="视觉质量实时探针">
      <div className="visual-ci-head"><span>VISUAL CI · {report.variant.toUpperCase()}</span><b>{report.automatedScore}<small>/100 AUTO</small></b></div>
      <p className="visual-ci-warning">自动指标只负责发现回归，不能签发 Production。</p>
      <div className="visual-ci-metrics">
        <span><small>MEAN LUMA</small><b>{ratio(report.metrics.meanLuma)}</b></span>
        <span><small>BLACK</small><b>{ratio(report.metrics.blackRatio)}</b></span>
        <span><small>MIDTONE</small><b>{ratio(report.metrics.midtoneRatio)}</b></span>
        <span><small>EDGE</small><b>{ratio(report.metrics.edgeDensity)}</b></span>
      </div>
      <div className="visual-ci-checks">
        {automated.map((check) => <span key={check.id} className={check.status}><i />{check.label}<b>{check.status.toUpperCase()}</b></span>)}
      </div>
      <div className="visual-ci-human"><span>HUMAN EVIDENCE REQUIRED</span><p>{human.map((check) => check.label).join(' · ')}</p></div>
    </aside>
  );
}

function TreeGroup({ label, count, children }: { label: string; count: number; children: React.ReactNode }) {
  return <div className="tree-group"><div className="tree-group-label"><span><ChevronRight size={12} /> {label}</span><b>{count}</b></div>{children}</div>;
}

function TreeItem({ label, detail, accent = false }: { label: string; detail: string; accent?: boolean }) {
  return <div className="tree-item"><span className={accent ? 'node accent' : 'node'} /><div><strong>{label}</strong><small>{detail}</small></div></div>;
}
