import shutil
from pathlib import Path

from modelscope import snapshot_download


target = Path("/models/sensevoice")
source = Path(snapshot_download("iic/SenseVoiceSmall-onnx", cache_dir="/tmp/modelscope"))
target.parent.mkdir(parents=True, exist_ok=True)
shutil.copytree(source, target, dirs_exist_ok=True)
required = ("model_quant.onnx", "config.yaml", "am.mvn", "chn_jpn_yue_eng_ko_spectok.bpe.model")
missing = [name for name in required if not (target / name).exists()]
if missing:
    raise RuntimeError(f"SenseVoice model is incomplete: {', '.join(missing)}")
