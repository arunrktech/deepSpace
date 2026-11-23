"""Run the original cost_model.py on the example and three variants; write golden JSON.

The TypeScript port (src/cost/costModel.ts) must return exactly this output; see
src/cost/costModel.test.ts. Last generated with Python 3.14.5 against
github.com/arunrktech/cloud-cost-comparator at commit c142d6d (2026-11-06).

Usage:
  git clone https://github.com/arunrktech/cloud-cost-comparator <dir>
  python -I scripts/make-cost-golden.py <dir> src/cost/__fixtures__
"""
import copy, json, os, sys

repo, out = sys.argv[1], sys.argv[2]
sys.path.insert(0, os.path.join(repo, "scripts"))
import cost_model  # noqa: E402

ex = os.path.join(repo, "assets", "example")
prices = json.load(open(os.path.join(ex, "prices.json"), encoding="utf-8"))
workload = json.load(open(os.path.join(ex, "workload.json"), encoding="utf-8"))

def aws_web_unpriced():
    p = copy.deepcopy(prices)
    aws = p["clouds"]["aws"]
    aws[:] = [l for l in aws if l["component"] != "web"]
    aws.append({"component": "web", "item": "EC2 m7i.large", "source": "unpriced", "note": "price not found"})
    return p, workload

def gcp_partial():
    p = copy.deepcopy(prices)
    p["clouds"]["gcp"].append({"component": "web", "item": "OS licence", "source": "unpriced", "note": "not found"})
    return p, workload

def azure_files_missing_no_workload():
    p = copy.deepcopy(prices)
    p["clouds"]["azure"] = [l for l in p["clouds"]["azure"] if l["component"] != "files"]
    return p, None

cases = {"example": (prices, workload), "aws-web-unpriced": aws_web_unpriced(),
         "gcp-partial": gcp_partial(), "azure-files-missing-no-workload": azure_files_missing_no_workload()}
golden = {name: cost_model.compute(p, w) for name, (p, w) in cases.items()}
with open(os.path.join(out, "costs.golden.json"), "w", encoding="utf-8") as f:
    json.dump(golden, f, indent=1)
print("python", sys.version.split()[0], "->", ", ".join(f"{k}: {v['variance']['ondemand']['totals']}" for k, v in golden.items()))
