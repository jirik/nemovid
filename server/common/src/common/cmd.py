import subprocess


def run_cmd(cmd: str) -> str:
    print(f"running {cmd}")
    result = subprocess.Popen(
        cmd, shell=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE
    )
    stdout, stderr = result.communicate()
    return_code = result.returncode
    assert return_code == 0, (
        f"command {cmd} failed with return code {return_code}\n"
        f"stdout:\n{stdout}\nstderr:\n{stderr}"
    )
    return stdout.decode("utf-8")
