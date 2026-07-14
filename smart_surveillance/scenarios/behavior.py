from core.detector import run_behavior

def run(video, cfg, stream=False):
    gen = run_behavior(video, cfg, stream)
    if gen is None:
        raise RuntimeError(f"Behavior pipeline failed to open video {video}")
    return gen
