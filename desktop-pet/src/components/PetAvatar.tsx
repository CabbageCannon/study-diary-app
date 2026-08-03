import { useEffect } from "react";

import idleGif from "../assets/pet/idle.gif";
import milestoneGif from "../assets/pet/milestone.gif";
import rainGif from "../assets/pet/rain.gif";
import studyingGif from "../assets/pet/studying.gif";
import type { PetVisualState } from "../types";

const petAssets: Record<PetVisualState, string> = {
  idle: idleGif,
  rain: rainGif,
  studying: studyingGif,
  milestone: milestoneGif,
};

interface PetAvatarProps {
  visualState: PetVisualState;
  onClick: () => void;
  onDoubleClick: () => void;
}

export function PetAvatar({ visualState, onClick, onDoubleClick }: PetAvatarProps) {
  useEffect(() => {
    Object.values(petAssets).forEach((source) => {
      const image = new Image();
      image.src = source;
    });
  }, []);

  return (
    <button className="pet-avatar" data-tauri-drag-region onClick={onClick} onDoubleClick={onDoubleClick} type="button" aria-label="打开学习桌宠快捷操作">
      {Object.entries(petAssets).map(([state, source]) => (
        <img alt="" aria-hidden={state !== visualState} className={state === visualState ? "pet-gif pet-gif-visible" : "pet-gif"} draggable={false} key={state} src={source} />
      ))}
    </button>
  );
}
