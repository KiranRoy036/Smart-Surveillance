import json
import sys
import os

# project root = folder where main.py exists
PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))


def abs_path(relative_path: str):
    """Convert project relative path -> absolute path"""
    return os.path.join(PROJECT_ROOT, relative_path)


def run_pipeline(config_relative_path: str):

    config_path = abs_path(config_relative_path)

    if not os.path.exists(config_path):
        raise FileNotFoundError(f"Config not found: {config_path}")

    with open(config_path) as f:
        cfg = json.load(f)

    scenario = cfg["scenario"]
    video = abs_path(cfg["video"])

    if not os.path.exists(video):
        raise FileNotFoundError(f"Video not found: {video}")

    if scenario == "LINE_CROSSING":
        from scenarios.line_crossing import run
    elif scenario == "BEHAVIOR":
        from scenarios.behavior import run
    else:
        raise ValueError(f"Unknown scenario: {scenario}")

    run(video, cfg)


# allow terminal usage also
if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python main.py <config_file>")
        exit()

    run_pipeline(sys.argv[1])
