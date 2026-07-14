import cv2
import threading
from scenarios.line_crossing import run as line_run
from scenarios.behavior import run as behavior_run

class CameraStream:
    def __init__(self, source, scenario, config):
        self.source = source
        self.scenario = scenario
        self.config = config
        self.frame = None
        self.running = False
        self.thread = None

    def start(self):
        if self.running:
            return
        self.running = True
        self.thread = threading.Thread(target=self.update, daemon=True)
        self.thread.start()

    def stop(self):
        self.running = False

    def update(self):
        if self.scenario == "LINE_CROSSING":
            generator = line_run(self.source, self.config, stream=True)
        else:
            generator = behavior_run(self.source, self.config, stream=True)

        for frame in generator:
            if not self.running:
                break
            self.frame = frame

    def get_frame(self):
        if self.frame is None:
            return None
        _, jpeg = cv2.imencode('.jpg', self.frame)
        return jpeg.tobytes()
