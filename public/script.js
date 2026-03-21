const form = document.getElementById("analysis-form");
const provinceSelect = document.getElementById("province");
const citySelect = document.getElementById("city");
const resultPanelHead = document.getElementById("result-panel-head");
const resultEmpty = document.getElementById("result-empty");
const resultContent = document.getElementById("result-content");
const submitButton = document.getElementById("submit-button");
const formStatus = document.getElementById("form-status");

const resultTitleNode = document.getElementById("result-title");
const resultDescriptionNode = document.getElementById("result-description");
const reasonsList = document.getElementById("reasons-list");
const cityInsightList = document.getElementById("city-insight-list");
const companyInsightList = document.getElementById("company-insight-list");
const strengthsList = document.getElementById("strengths-list");
const actionsList = document.getElementById("actions-list");
const nextPathNode = document.getElementById("next-path");

const cityOptions = {
  北京: ["北京"],
  天津: ["天津"],
  上海: ["上海"],
  重庆: ["重庆"],
  河北: ["石家庄", "唐山", "秦皇岛", "邯郸", "邢台", "保定", "张家口", "承德", "沧州", "廊坊", "衡水"],
  山西: ["太原", "大同", "阳泉", "长治", "晋城", "朔州", "晋中", "运城", "忻州", "临汾", "吕梁"],
  辽宁: ["沈阳", "大连", "鞍山", "抚顺", "本溪", "丹东", "锦州", "营口", "阜新", "辽阳", "盘锦", "铁岭", "朝阳", "葫芦岛"],
  吉林: ["长春", "吉林", "四平", "辽源", "通化", "白山", "松原", "白城", "延吉"],
  黑龙江: ["哈尔滨", "齐齐哈尔", "牡丹江", "佳木斯", "大庆", "鸡西", "双鸭山", "伊春", "七台河", "黑河", "绥化"],
  江苏: ["南京", "无锡", "徐州", "常州", "苏州", "南通", "连云港", "淮安", "盐城", "扬州", "镇江", "泰州", "宿迁"],
  浙江: ["杭州", "宁波", "温州", "嘉兴", "湖州", "绍兴", "金华", "衢州", "舟山", "台州", "丽水"],
  安徽: ["合肥", "芜湖", "蚌埠", "淮南", "马鞍山", "淮北", "铜陵", "安庆", "黄山", "滁州", "阜阳", "宿州", "六安", "亳州", "池州", "宣城"],
  福建: ["福州", "厦门", "莆田", "三明", "泉州", "漳州", "南平", "龙岩", "宁德"],
  江西: ["南昌", "景德镇", "萍乡", "九江", "新余", "鹰潭", "赣州", "吉安", "宜春", "抚州", "上饶"],
  山东: ["济南", "青岛", "淄博", "枣庄", "东营", "烟台", "潍坊", "济宁", "泰安", "威海", "日照", "临沂", "德州", "聊城", "滨州", "菏泽"],
  河南: ["郑州", "开封", "洛阳", "平顶山", "安阳", "鹤壁", "新乡", "焦作", "濮阳", "许昌", "漯河", "三门峡", "南阳", "商丘", "信阳", "周口", "驻马店", "济源"],
  湖北: ["武汉", "黄石", "十堰", "宜昌", "襄阳", "鄂州", "荆门", "孝感", "荆州", "黄冈", "咸宁", "随州", "恩施"],
  湖南: ["长沙", "株洲", "湘潭", "衡阳", "邵阳", "岳阳", "常德", "张家界", "益阳", "郴州", "永州", "怀化", "娄底", "湘西"],
  广东: ["广州", "深圳", "珠海", "汕头", "佛山", "韶关", "河源", "梅州", "惠州", "汕尾", "东莞", "中山", "江门", "阳江", "湛江", "茂名", "肇庆", "清远", "潮州", "揭阳", "云浮"],
  海南: ["海口", "三亚", "儋州", "琼海", "文昌", "万宁", "东方"],
  四川: ["成都", "自贡", "攀枝花", "泸州", "德阳", "绵阳", "广元", "遂宁", "内江", "乐山", "南充", "眉山", "宜宾", "广安", "达州", "雅安", "巴中", "资阳"],
  贵州: ["贵阳", "六盘水", "遵义", "安顺", "毕节", "铜仁", "兴义", "凯里", "都匀"],
  云南: ["昆明", "曲靖", "玉溪", "保山", "昭通", "丽江", "普洱", "临沧", "楚雄", "红河", "文山", "西双版纳", "大理", "德宏"],
  陕西: ["西安", "铜川", "宝鸡", "咸阳", "渭南", "延安", "汉中", "榆林", "安康", "商洛"],
  甘肃: ["兰州", "嘉峪关", "金昌", "白银", "天水", "武威", "张掖", "平凉", "酒泉", "庆阳", "定西", "陇南"],
  广西: ["南宁", "柳州", "桂林", "梧州", "北海", "防城港", "钦州", "贵港", "玉林", "百色", "贺州", "河池", "来宾", "崇左"],
  内蒙古: ["呼和浩特", "包头", "乌海", "赤峰", "通辽", "鄂尔多斯", "呼伦贝尔", "巴彦淖尔", "乌兰察布"],
  宁夏: ["银川", "石嘴山", "吴忠", "固原", "中卫"],
  新疆: ["乌鲁木齐", "克拉玛依", "吐鲁番", "哈密", "昌吉", "博乐", "库尔勒", "阿克苏", "喀什", "和田", "伊宁"],
};

let latestReport = null;

provinceSelect.addEventListener("change", () => handleProvinceChange(""));
form.addEventListener("submit", handleSubmit);

setStatus("填写岗位、城市和工作特征后，就能生成更贴近现实的职业判断。");
handleProvinceChange("");

function handleProvinceChange(preferredCity = citySelect.value) {
  const province = provinceSelect.value;
  const cities = cityOptions[province] || [];

  citySelect.innerHTML = "";

  if (!province) {
    citySelect.disabled = true;
    citySelect.innerHTML = '<option value="">请先选择省份</option>';
    return;
  }

  citySelect.disabled = false;
  citySelect.append(new Option("请选择城市", ""));
  cities.forEach((city) => {
    citySelect.append(new Option(city, city, false, city === preferredCity));
  });

  if (preferredCity && cities.includes(preferredCity)) {
    citySelect.value = preferredCity;
  }
}

async function handleSubmit(event) {
  event.preventDefault();

  const formData = new FormData(form);
  const data = Object.fromEntries(formData.entries());

  setLoading(true);
  setStatus("正在生成 AI 分析报告...");

  try {
    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });

    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.detail || payload.error || "分析失败，请稍后重试。");
    }

    latestReport = payload;
    renderReport(payload);
    setStatus("分析报告已生成。");
  } catch (error) {
    console.error(error);
    setStatus(error.message || "分析失败，请稍后重试。");
  } finally {
    setLoading(false);
  }
}

function setLoading(isLoading) {
  Array.from(form.elements).forEach((element) => {
    element.disabled = isLoading;
  });
  submitButton.disabled = isLoading;
  submitButton.textContent = isLoading ? "正在生成报告..." : "生成 AI 分析报告";

  if (!isLoading) {
    handleProvinceChange(citySelect.value);
  }
}

function setStatus(text) {
  formStatus.textContent = text;
}

function renderReport(report) {
  resultPanelHead?.classList.add("hidden");
  resultEmpty?.classList.add("hidden");
  resultContent?.classList.remove("hidden");

  if (resultTitleNode) {
    resultTitleNode.textContent = report.title;
  }
  if (resultDescriptionNode) {
    resultDescriptionNode.textContent = report.description;
  }

  fillList(reasonsList, report.reasons);
  fillList(cityInsightList, report.cityInsights);
  fillList(companyInsightList, report.companyInsights);
  fillList(strengthsList, report.strengths);
  fillList(actionsList, report.actions);
  if (nextPathNode) {
    nextPathNode.textContent = report.nextPath;
  }

  resultContent?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function fillList(node, items) {
  if (!node) {
    return;
  }
  node.innerHTML = "";
  items.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    node.appendChild(li);
  });
}
