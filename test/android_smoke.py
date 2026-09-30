"""Smoke-test the actual signed preview APK via Android accessibility and adb."""
from pathlib import Path
import re
import subprocess
import time
import xml.etree.ElementTree as ET

OUT = Path('device-results')
OUT.mkdir(exist_ok=True)
PACKAGE = 'com.logicspark.game.preview'

def adb(*args):
    return subprocess.check_output(['adb', *args], text=True, timeout=45)

def tree():
    adb('shell', 'uiautomator', 'dump', '/sdcard/logicspark-window.xml')
    adb('pull', '/sdcard/logicspark-window.xml', str(OUT / 'window.xml'))
    return ET.parse(OUT / 'window.xml').getroot()

def find(label):
    for _ in range(8):
        root = tree()
        for node in root.iter('node'):
            if label in (node.attrib.get('text', ''), node.attrib.get('content-desc', '')):
                return node
        time.sleep(1)
    raise AssertionError(f'Android UI does not contain {label!r}')

def tap(label):
    node = find(label)
    coords = list(map(int, re.findall(r'\d+', node.attrib['bounds'])))
    assert len(coords) == 4, node.attrib
    adb('shell', 'input', 'tap', str((coords[0] + coords[2]) // 2), str((coords[1] + coords[3]) // 2))
    time.sleep(1)

def screenshot(name):
    with (OUT / name).open('wb') as f:
        subprocess.run(['adb', 'exec-out', 'screencap', '-p'], stdout=f, check=True, timeout=30)

try:
    adb('install', '-r', 'dist/LogicSpark-v0.1.0-preview.apk')
    adb('logcat', '-c')
    adb('shell', 'svc', 'wifi', 'disable')
    adb('shell', 'svc', 'data', 'disable')
    adb('shell', 'am', 'start', '-W', '-n', PACKAGE + '/com.logicspark.game.MainActivity')
    find('Start playing')
    screenshot('home-android.png')
    tap('Start playing')
    find('The growing gap')
    tap('26')
    find('Solved!')
    find('Score 100')
    screenshot('solved-android.png')
    adb('shell', 'am', 'force-stop', PACKAGE)
    adb('shell', 'am', 'start', '-W', '-n', PACKAGE + '/com.logicspark.game.MainActivity')
    find('Continue playing')
    tap('Continue playing')
    find('Score 100')
    find('Solved!')
    tap('العربية')
    find('الفرق يكبر')
    screenshot('arabic-android.png')
    adb('shell', 'input', 'keyevent', '4')
    find('كمل اللعب')
    print('PASS actual APK on Android 15: offline launch, solve, score, persistence after force-stop, Arabic, native Back.')
finally:
    (OUT / 'logcat.txt').write_text(adb('logcat', '-d', '-t', '1500'), encoding='utf-8')
