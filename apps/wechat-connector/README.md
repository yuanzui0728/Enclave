# WeChat local sync notes

The connector on port `17364` can read a local `wechat-decrypt` HTTP service
from `http://127.0.0.1:5678`.

Current verified upstream:

- `ylytdeng/wechat-decrypt`: works with the local Windows `Weixin.exe` 4.x data
  layout under `xwechat_files/<wxid>/db_storage`. It extracts per-database keys
  from the running process, decrypts `contact`, `session`, and `message` DBs,
  and exposes `/api/history` and `/api/tags`.
- `hellodigua/ChatLab`: useful as an import/analysis reference, but it is not a
  live WeChat database decryptor and does not replace the 5678 source service.

Local runbook used on this machine:

1. Clone `https://github.com/ylytdeng/wechat-decrypt` into
   `.cache/upstreams/wechat-decrypt`.
2. Create `.cache/upstreams/wechat-decrypt/.venv` and install
   `requirements.txt`.
3. Set `config.json` to the active WeChat storage path, for example
   `C:\Users\86177\xwechat_files\wxid_ughrxy42b28e12_7686\db_storage`.
4. Run `python main.py decrypt` once after extracting keys so historical
   contact and message databases exist under `decrypted/`.
5. Run `python main.py` to serve `http://127.0.0.1:5678`.

The upstream Web UI originally returns only messages observed after startup
from `/api/history`. The local verified clone has a small patch that also reads
recent history from decrypted `message_*.db` files, which is required for the
admin sync scan.
