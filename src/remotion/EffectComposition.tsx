import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import {EffectRuntime} from './EffectRuntime';
import {EFFECT_SAMPLE, type EffectTemplate} from '../lib/motion-library/contract';
export function EffectComposition({template}: {template:EffectTemplate}) {
  const frame=useCurrentFrame(),{fps}=useVideoConfig();
  return <AbsoluteFill style={{background:'#10121a',fontFamily:'"Noto Sans CJK SC","PingFang SC",sans-serif'}}><EffectRuntime template={template} scene={EFFECT_SAMPLE} frame={frame} fps={fps}/></AbsoluteFill>;
}
