/**
 * 智能识别文件名中的日期区间
 * 支持多种日期格式，返回格式化为 "YYYY年MM月DD日~YYYY年MM月DD日"
 */

/**
 * 解析单个日期字符串为 Date 对象
 */
function parseDate(dateStr: string, fallbackYear?: number): Date | null {
  // 清理字符串
  const cleaned = dateStr.trim();

  // 格式: YYYY年MM月DD日
  const chineseMatch = cleaned.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日?$/);
  if (chineseMatch) {
    return new Date(
      parseInt(chineseMatch[1]),
      parseInt(chineseMatch[2]) - 1,
      parseInt(chineseMatch[3])
    );
  }

  // 格式: YYYY-MM-DD 或 YYYYMMDD 或 YYYY.MM.DD
  const isoMatch = cleaned.match(/^(\d{4})[-/.]?(\d{2})[-/.]?(\d{2})$/);
  if (isoMatch) {
    return new Date(
      parseInt(isoMatch[1]),
      parseInt(isoMatch[2]) - 1,
      parseInt(isoMatch[3])
    );
  }

  // 格式: DD_MM_YYYY 或 DD-MM-YYYY 或 DD.MM.YYYY (日_月_年，Shopee 等电商平台常用)
  const ddMmYyyyMatch = cleaned.match(/^(\d{1,2})[-_.](\d{1,2})[-_.](\d{4})$/);
  if (ddMmYyyyMatch) {
    const day = parseInt(ddMmYyyyMatch[1]);
    const month = parseInt(ddMmYyyyMatch[2]);
    const year = parseInt(ddMmYyyyMatch[3]);
    // 验证月份在合理范围内
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return new Date(year, month - 1, day);
    }
  }

  // 格式: MM-DD 或 MMDD (需要推断年份)
  const shortMatch = cleaned.match(/^(\d{2})[-/.](\d{2})$/);
  if (shortMatch) {
    const month = parseInt(shortMatch[1]);
    const day = parseInt(shortMatch[2]);
    // 使用提供的年份或当前年份
    const year = fallbackYear || new Date().getFullYear();
    // 简单验证月份和日期范围
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return new Date(year, month - 1, day);
    }
  }

  return null;
}

/**
 * 格式化日期为 "YYYY年MM月DD日"
 */
function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}年${month}月${day}日`;
}

/**
 * 从文件名中提取所有可能的日期
 */
function extractDates(filename: string): Date[] {
  const dates: Date[] = [];

  // 获取当前年份作为备选
  const currentYear = new Date().getFullYear();

  // 提取所有 YYYYMMDD 或 YYYY-MM-DD 等格式的日期
  const longDatePattern = /(\d{4})[-/.]?(\d{2})[-/.]?(\d{2})/g;
  let match;
  while ((match = longDatePattern.exec(filename)) !== null) {
    const date = parseDate(match[0]);
    if (date) {
      dates.push(date);
    }
  }

  // 提取中文日期格式
  const chinesePattern = /(\d{4})年(\d{1,2})月(\d{1,2})日/g;
  while ((match = chinesePattern.exec(filename)) !== null) {
    const date = parseDate(match[0]);
    if (date) {
      dates.push(date);
    }
  }

  // 提取 DD_MM_YYYY 或 DD-MM-YYYY 格式 (日_月_年，Shopee 等电商平台常用)
  const ddMmYyyyPattern = /(\d{1,2})[-_.](\d{1,2})[-_.](\d{4})/g;
  while ((match = ddMmYyyyPattern.exec(filename)) !== null) {
    const day = parseInt(match[1]);
    const month = parseInt(match[2]);
    const year = parseInt(match[3]);
    // 验证月份在合理范围内
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      dates.push(new Date(year, month - 1, day));
    }
  }

  // 提取 MM-DD 或 MMDD 格式（不带年份）
  // 这种格式通常需要两个日期组成区间
  // 注意：只匹配月份在 1-12 范围内的日期，避免误匹配 DD-MM-YYYY 格式
  const shortPattern = /(\d{2})[-/.](\d{2})(?=[^-\d]|$)/g;
  const shortDates: { month: number; day: number; index: number }[] = [];
  while ((match = shortPattern.exec(filename)) !== null) {
    const first = parseInt(match[1]);
    const second = parseInt(match[2]);
    // 判断哪个是月份（必须在 1-12 范围内）
    let month: number, day: number;
    if (first >= 1 && first <= 12 && second >= 1 && second <= 31) {
      // 格式为 MM-DD
      month = first;
      day = second;
    } else if (second >= 1 && second <= 12 && first >= 1 && first <= 31) {
      // 格式为 DD-MM
      month = second;
      day = first;
    } else {
      continue;
    }
    shortDates.push({ month, day, index: match.index });
    // 如果有两个短日期，用当前年份创建完整日期
    if (shortDates.length === 2) {
      const year = dates.length > 0 ? dates[0].getFullYear() : currentYear;
      dates.push(new Date(year, shortDates[0].month - 1, shortDates[0].day));
      dates.push(new Date(year, shortDates[1].month - 1, shortDates[1].day));
    }
  }

  return dates;
}

/**
 * 智能识别文件名中的日期区间
 * @param filename 原始文件名
 * @returns 格式化的日期区间字符串，如 "2024年01月01日~2024年01月07日"，如果无法识别则返回 null
 */
export function smartExtractDateRange(filename: string): string | null {
  // 清理文件名（去除扩展名）
  const nameWithoutExt = filename.replace(/\.[^.]+$/, "");

  // 0. 首先尝试匹配 DD_MM_YYYY 格式的区间
  // 策略1：日期用 [_./] 分隔，区间用 [-~至到] 分隔（最明确）
  const ddMmYyyyRangeMatch1 = nameWithoutExt.match(
    /(\d{1,2})[_.](\d{1,2})[_.](\d{4})\s*[~-至到-]\s*(\d{1,2})[_.](\d{1,2})[_.](\d{4})/
  );
  if (ddMmYyyyRangeMatch1) {
    const startDay = parseInt(ddMmYyyyRangeMatch1[1]);
    const startMonth = parseInt(ddMmYyyyRangeMatch1[2]);
    const startYear = parseInt(ddMmYyyyRangeMatch1[3]);
    const endDay = parseInt(ddMmYyyyRangeMatch1[4]);
    const endMonth = parseInt(ddMmYyyyRangeMatch1[5]);
    const endYear = parseInt(ddMmYyyyRangeMatch1[6]);

    if (
      startMonth >= 1 && startMonth <= 12 && startDay >= 1 && startDay <= 31 &&
      endMonth >= 1 && endMonth <= 12 && endDay >= 1 && endDay <= 31
    ) {
      const startDate = new Date(startYear, startMonth - 1, startDay);
      const endDate = new Date(endYear, endMonth - 1, endDay);
      return `${formatDate(startDate)}~${formatDate(endDate)}`;
    }
  }

  // 策略2：日期用 [-] 分隔，区间用 [-] 分隔（Shopee 格式，如 14-04-2026-14-04-2026）
  // 需要判断哪部分是日，哪部分是月
  // 判断逻辑：如果第一个数字 >= 13，它更可能是日（因为月份最大是12）
  const ddMmYyyyRangeMatch2 = nameWithoutExt.match(
    /(\d{1,2})-(\d{1,2})-(\d{4})\s*-\s*(\d{1,2})-(\d{1,2})-(\d{4})/
  );
  if (ddMmYyyyRangeMatch2) {
    const p1 = parseInt(ddMmYyyyRangeMatch2[1]);
    const p2 = parseInt(ddMmYyyyRangeMatch2[2]);
    const p3 = parseInt(ddMmYyyyRangeMatch2[3]); // year
    const p4 = parseInt(ddMmYyyyRangeMatch2[4]);
    const p5 = parseInt(ddMmYyyyRangeMatch2[5]);
    const p6 = parseInt(ddMmYyyyRangeMatch2[6]); // year

    // 判断第一个日期的日和月
    let startDay = 0, startMonth = 0, startYear = 0;
    if (p1 >= 13) {
      // p1 是日，p2 是月
      startDay = p1;
      startMonth = p2;
      startYear = p3;
    } else if (p2 >= 13) {
      // p2 是日，p1 是月
      startDay = p2;
      startMonth = p1;
      startYear = p3;
    } else if (p1 === 0 || p2 === 0) {
      // 无效日期，跳过
    } else {
      // 无法判断，使用 p1 作为月（常见格式）
      startMonth = p1;
      startDay = p2;
      startYear = p3;
    }

    // 判断第二个日期的日和月
    let endDay = 0, endMonth = 0, endYear = 0;
    if (p4 >= 13) {
      endDay = p4;
      endMonth = p5;
      endYear = p6;
    } else if (p5 >= 13) {
      endDay = p5;
      endMonth = p4;
      endYear = p6;
    } else if (p4 === 0 || p5 === 0) {
      // 无效日期，跳过
    } else {
      // 无法判断，使用 p4 作为月
      endMonth = p4;
      endDay = p5;
      endYear = p6;
    }

    if (
      startMonth >= 1 && startMonth <= 12 && startDay >= 1 && startDay <= 31 &&
      endMonth >= 1 && endMonth <= 12 && endDay >= 1 && endDay <= 31
    ) {
      const startDate = new Date(startYear, startMonth - 1, startDay);
      const endDate = new Date(endYear, endMonth - 1, endDay);
      return `${formatDate(startDate)}~${formatDate(endDate)}`;
    }
  }

  // 1. 首先尝试匹配已格式化的中文区间 (2024年01月01日~2024年01月07日)
  const chineseRangeMatch = nameWithoutExt.match(
    /(\d{4})年(\d{1,2})月(\d{1,2})日\s*[~-至到]\s*(\d{4})年(\d{1,2})月(\d{1,2})日/
  );
  if (chineseRangeMatch) {
    const startDate = new Date(
      parseInt(chineseRangeMatch[1]),
      parseInt(chineseRangeMatch[2]) - 1,
      parseInt(chineseRangeMatch[3])
    );
    const endDate = new Date(
      parseInt(chineseRangeMatch[4]),
      parseInt(chineseRangeMatch[5]) - 1,
      parseInt(chineseRangeMatch[6])
    );
    return `${formatDate(startDate)}~${formatDate(endDate)}`;
  }

  // 2. 尝试匹配 ISO 格式的区间 (2024-01-01~2024-01-07 或 20240101~20240107)
  const isoRangeMatch = nameWithoutExt.match(
    /(\d{4})[-/.]?(\d{2})[-/.]?(\d{2})\s*[~-至到]\s*(\d{4})[-/.]?(\d{2})[-/.]?(\d{2})/
  );
  if (isoRangeMatch) {
    const startDate = new Date(
      parseInt(isoRangeMatch[1]),
      parseInt(isoRangeMatch[2]) - 1,
      parseInt(isoRangeMatch[3])
    );
    const endDate = new Date(
      parseInt(isoRangeMatch[4]),
      parseInt(isoRangeMatch[5]) - 1,
      parseInt(isoRangeMatch[6])
    );
    return `${formatDate(startDate)}~${formatDate(endDate)}`;
  }

  // 3. 尝试匹配纯数字的日期区间 (如 20240101_20240107 或 20240101-20240107)
  // 注意：要在 extractDates 之前检查，避免去重后丢失区间信息
  const compactRangeMatch = nameWithoutExt.match(/(\d{8})\s*[~_至到-]\s*(\d{8})/);
  if (compactRangeMatch) {
    const startStr = compactRangeMatch[1];
    const endStr = compactRangeMatch[2];
    const startDate = parseDate(startStr);
    const endDate = parseDate(endStr);
    if (startDate && endDate) {
      return `${formatDate(startDate)}~${formatDate(endDate)}`;
    }
  }

  // 4. 尝试匹配其他格式的日期区间和单个日期
  const dates = extractDates(nameWithoutExt);
  if (dates.length >= 1) {
    // 去重并排序
    const uniqueDates = [...new Set(dates.map((d) => d.getTime()))]
      .map((t) => new Date(t))
      .sort((a, b) => a.getTime() - b.getTime());

    if (uniqueDates.length === 1) {
      // 只有一个日期，返回单个日期
      return formatDate(uniqueDates[0]);
    } else if (uniqueDates.length >= 2) {
      // 多个日期，返回最小和最大日期作为区间
      return `${formatDate(uniqueDates[0])}~${formatDate(uniqueDates[uniqueDates.length - 1])}`;
    }
  }

  // 无法识别日期区间
  return null;
}
