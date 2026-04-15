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

  // 提取 MM-DD 或 MMDD 格式（不带年份）
  // 这种格式通常需要两个日期组成区间
  const shortPattern = /(\d{2})[-/.](\d{2})(?=[^-\d]|$)/g;
  const shortDates: { month: number; day: number; index: number }[] = [];
  while ((match = shortPattern.exec(filename)) !== null) {
    const month = parseInt(match[1]);
    const day = parseInt(match[2]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      shortDates.push({ month, day, index: match.index });
      // 如果有两个短日期，用当前年份创建完整日期
      if (shortDates.length === 2) {
        const year = dates.length > 0 ? dates[0].getFullYear() : currentYear;
        dates.push(new Date(year, shortDates[0].month - 1, shortDates[0].day));
        dates.push(new Date(year, shortDates[1].month - 1, shortDates[1].day));
      }
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

  // 3. 尝试匹配单个日期 (只返回一个日期，不是区间)
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

  // 4. 尝试匹配纯数字的日期区间 (如 2024010120240107)
  const compactRangeMatch = nameWithoutExt.match(/(\d{8})\s*[~-至到]\s*(\d{8})/);
  if (compactRangeMatch) {
    const startStr = compactRangeMatch[1];
    const endStr = compactRangeMatch[2];
    const startDate = parseDate(startStr);
    const endDate = parseDate(endStr);
    if (startDate && endDate) {
      return `${formatDate(startDate)}~${formatDate(endDate)}`;
    }
  }

  // 无法识别日期区间
  return null;
}
