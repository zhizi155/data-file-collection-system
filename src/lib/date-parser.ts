/**
 * 日期/期间解析器
 * 支持多种中文/数字日期格式
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// 解析结果
export interface ParsedPeriod {
  start: string | null; // ISO date string (YYYY-MM-DD)
  end: string | null;   // ISO date string (YYYY-MM-DD)
  label: string | null; // 可读标签
  status: 'success' | 'failed' | 'pending' | 'manual';
  source: 'filename' | 'user_input' | 'system';
  confidence: 'high' | 'medium' | 'low' | 'none';
}

// 支持的日期格式模式
const DATE_PATTERNS = [
  // 2026年01月01日-2026年01月05日
  {
    pattern: /(\d{4})年(\d{1,2})月(\d{1,2})日[~\-至到](\d{4})年(\d{1,2})月(\d{1,2})日/,
    parse: (m: RegExpMatchArray) => ({
      start: `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`,
      end: `${m[4]}-${m[5].padStart(2, '0')}-${m[6].padStart(2, '0')}`,
      label: `${m[1]}年${m[2]}月${m[3]}日-${m[4]}年${m[5]}月${m[6]}日`,
      confidence: 'high' as const
    })
  },
  // 2026年01月01日-01月05日
  {
    pattern: /(\d{4})年(\d{1,2})月(\d{1,2})日[~\-至到](\d{1,2})月(\d{1,2})日/,
    parse: (m: RegExpMatchArray) => ({
      start: `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`,
      end: `${m[1]}-${m[4].padStart(2, '0')}-${m[5].padStart(2, '0')}`,
      label: `${m[1]}年${m[2]}月${m[3]}日-${m[4]}月${m[5]}日`,
      confidence: 'high' as const
    })
  },
  // 2026年01月
  {
    pattern: /(\d{4})年(\d{1,2})月/,
    parse: (m: RegExpMatchArray) => {
      const year = m[1];
      const month = m[2].padStart(2, '0');
      const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
      return {
        start: `${year}-${month}-01`,
        end: `${year}-${month}-${String(lastDay).padStart(2, '0')}`,
        label: `${year}年${month}月`,
        confidence: 'medium' as const
      };
    }
  },
  // 2026-01-01_2026-01-05 或 2026-01-01~2026-01-05
  {
    pattern: /(\d{4})-(\d{1,2})-(\d{1,2})[~_\-至到](\d{4})-(\d{1,2})-(\d{1,2})/,
    parse: (m: RegExpMatchArray) => ({
      start: `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`,
      end: `${m[4]}-${m[5].padStart(2, '0')}-${m[6].padStart(2, '0')}`,
      label: `${m[1]}-${m[2]}-${m[3]} 至 ${m[4]}-${m[5]}-${m[6]}`,
      confidence: 'high' as const
    })
  },
  // 2026-01-01
  {
    pattern: /(\d{4})-(\d{1,2})-(\d{1,2})/,
    parse: (m: RegExpMatchArray) => ({
      start: `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`,
      end: `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`,
      label: `${m[1]}-${m[2]}-${m[3]}`,
      confidence: 'medium' as const
    })
  },
  // 20260101
  {
    pattern: /(\d{4})(\d{2})(\d{2})/,
    parse: (m: RegExpMatchArray) => ({
      start: `${m[1]}-${m[2]}-${m[3]}`,
      end: `${m[1]}-${m[2]}-${m[3]}`,
      label: `${m[1]}-${m[2]}-${m[3]}`,
      confidence: 'low' as const
    })
  },
  // 近五天、近七天等
  {
    pattern: /近([三五七十四]+)天/,
    parse: (m: RegExpMatchArray) => {
      const dayMap: Record<string, number> = {
        '三': 3, '五': 5, '七': 7, '十': 10, '十四': 14
      };
      const days = dayMap[m[1]] || 7;
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - days + 1);
      return {
        start: formatDate(start),
        end: formatDate(end),
        label: `近${m[1]}天`,
        confidence: 'low' as const
      };
    }
  }
];

/**
 * 格式化日期为 ISO 字符串
 */
function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 验证日期是否有效
 */
function isValidDate(dateStr: string): boolean {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return false;
  
  // 检查年份范围
  const year = date.getFullYear();
  if (year < 2000 || year > 2100) return false;
  
  // 检查日期是否回绕（如 2月30日）
  const [y, m, d] = dateStr.split('-').map(Number);
  return date.getFullYear() === y && 
         date.getMonth() + 1 === m && 
         date.getDate() === d;
}

/**
 * 从文件名解析日期/期间
 */
export function parseDateFromFilename(filename: string): ParsedPeriod {
  // 移除扩展名
  const nameWithoutExt = filename.replace(/\.[^/.]+$/, '');
  
  // 尝试匹配各种格式
  for (const { pattern, parse } of DATE_PATTERNS) {
    const match = nameWithoutExt.match(pattern);
    if (match) {
      const result = parse(match);
      
      // 验证日期
      if (result.start && !isValidDate(result.start)) {
        continue;
      }
      if (result.end && !isValidDate(result.end)) {
        continue;
      }
      
      return {
        start: result.start,
        end: result.end,
        label: result.label,
        status: 'success',
        source: 'filename',
        confidence: result.confidence
      };
    }
  }
  
  // 无法解析
  return {
    start: null,
    end: null,
    label: null,
    status: 'failed',
    source: 'filename',
    confidence: 'none'
  };
}

/**
 * 解析用户输入的日期
 */
export function parseUserInputDate(input: string): ParsedPeriod {
  if (!input || !input.trim()) {
    return {
      start: null,
      end: null,
      label: null,
      status: 'pending',
      source: 'user_input',
      confidence: 'none'
    };
  }
  
  // 尝试解析
  const result = parseDateFromFilename(input);
  return {
    ...result,
    source: 'user_input'
  };
}

/**
 * 批量解析文件名中的日期
 */
export function batchParseDates(filenames: string[]): Map<string, ParsedPeriod> {
  const results = new Map<string, ParsedPeriod>();
  
  for (const filename of filenames) {
    results.set(filename, parseDateFromFilename(filename));
  }
  
  return results;
}

/**
 * 回填历史记录的归属期间
 */
export async function backfillPeriods(
  supabase: SupabaseClient,
  batchSize: number = 100
): Promise<{ processed: number; updated: number; failed: number }> {
  let processed = 0;
  let updated = 0;
  let failed = 0;
  
  // 获取需要回填的记录
  let offset = 0;
  while (true) {
    const { data: files, error } = await supabase
      .from('uploaded_files')
      .select('id, original_name, period_start')
      .is('period_start', null)
      .range(offset, offset + batchSize - 1);
    
    if (error || !files || files.length === 0) {
      break;
    }
    
    for (const file of files) {
      processed++;
      const parsed = parseDateFromFilename(file.original_name);
      
      if (parsed.status === 'success') {
        const { error: updateError } = await supabase
          .from('uploaded_files')
          .update({
            period_start: parsed.start,
            period_end: parsed.end,
            period_label: parsed.label,
            parse_status: parsed.status,
            parse_source: parsed.source
          })
          .eq('id', file.id);
        
        if (updateError) {
          failed++;
        } else {
          updated++;
        }
      } else {
        // 标记为待修正
        await supabase
          .from('uploaded_files')
          .update({
            parse_status: 'pending'
          })
          .eq('id', file.id);
      }
    }
    
    offset += batchSize;
  }
  
  return { processed, updated, failed };
}
