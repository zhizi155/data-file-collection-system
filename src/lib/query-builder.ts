/**
 * 统一查询构建器
 * 用于上传记录、收集进度、批量下载和导出共同复用
 */

import { SupabaseClient } from '@supabase/supabase-js';

// 筛选条件类型
export interface FileFilterParams {
  // 店铺筛选
  shopIds?: string[];
  // 平台筛选
  platforms?: string[];
  // 站点筛选
  sites?: string[];
  // 保存类型筛选
  exportTypes?: string[];
  // 保存文件名筛选（精确匹配）
  displayNames?: string[];
  // 保存文件名模糊搜索
  displayNameContains?: string;
  // 日期区间筛选
  dateRangeStart?: string;
  dateRangeEnd?: string;
  // 上传状态（收集进度用）
  uploadStatus?: 'uploaded' | 'not_uploaded' | 'all';
  // 负责人筛选（收集进度用）
  managers?: string[];
  // 是否只查询当前版本
  currentVersionOnly?: boolean;
  // 是否包含已删除
  includeDeleted?: boolean;
}

// 分页参数
export interface PaginationParams {
  page: number;
  pageSize: number;
}

// 排序参数
export interface SortParams {
  field: 'created_at' | 'display_name' | 'file_size' | 'original_name';
  order: 'asc' | 'desc';
}

// 查询结果
export interface QueryResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * 构建文件查询
 */
export function buildFileQuery(
  supabase: SupabaseClient,
  filters: FileFilterParams = {},
  pagination?: PaginationParams,
  sort?: SortParams
) {
  // 基础查询
  let query = supabase
    .from('uploaded_files')
    .select('*', { count: 'exact' });

  // 应用筛选条件
  query = applyFilters(query, filters, supabase);

  // 应用排序
  if (sort) {
    query = query.order(sort.field, { ascending: sort.order === 'asc' });
  } else {
    query = query.order('created_at', { ascending: false });
  }

  // 应用分页
  if (pagination) {
    const from = (pagination.page - 1) * pagination.pageSize;
    const to = from + pagination.pageSize - 1;
    query = query.range(from, to);
  }

  return query;
}

/**
 * 应用筛选条件
 */
function applyFilters(
  query: any,
  filters: FileFilterParams,
  supabase: SupabaseClient
) {
  // 店铺筛选
  if (filters.shopIds && filters.shopIds.length > 0) {
    query = query.in('shop_id', filters.shopIds);
  }

  // 平台筛选（通过关联店铺表）
  if (filters.platforms && filters.platforms.length > 0) {
    query = query.in('shop_id', 
      supabase.from('shops').select('id').in('platform', filters.platforms)
    );
  }

  // 站点筛选（通过关联店铺表）
  if (filters.sites && filters.sites.length > 0) {
    query = query.in('shop_id',
      supabase.from('shops').select('id').in('site', filters.sites)
    );
  }

  // 保存类型筛选
  if (filters.exportTypes && filters.exportTypes.length > 0) {
    query = query.in('export_type', filters.exportTypes);
  }

  // 保存文件名精确匹配
  if (filters.displayNames && filters.displayNames.length > 0) {
    query = query.in('display_name', filters.displayNames);
  }

  // 保存文件名模糊搜索
  if (filters.displayNameContains) {
    query = query.ilike('display_name', `%${filters.displayNameContains}%`);
  }

  // 日期区间筛选
  if (filters.dateRangeStart) {
    query = query.gte('created_at', filters.dateRangeStart);
  }
  if (filters.dateRangeEnd) {
    query = query.lte('created_at', filters.dateRangeEnd);
  }

  // 负责人筛选（通过关联店铺表）
  if (filters.managers && filters.managers.length > 0) {
    query = query.in('shop_id',
      supabase.from('shops').select('id').in('manager', filters.managers)
    );
  }

  // 只查询当前版本
  if (filters.currentVersionOnly !== false) {
    query = query.eq('is_current', true);
  }

  // 不包含已删除
  if (!filters.includeDeleted) {
    query = query.eq('is_deleted', false);
  }

  return query;
}

/**
 * 获取筛选选项（用于联动）
 */
export async function getFilterOptions(
  supabase: SupabaseClient,
  filters: FileFilterParams = {}
) {
  // 获取所有符合条件的文件
  let query = supabase
    .from('uploaded_files')
    .select(`
      display_name,
      export_type,
      created_at,
      shops:shop_id (
        id,
        name,
        platform,
        site,
        manager
      )
    `);

  query = applyFilters(query, { ...filters, currentVersionOnly: true }, supabase);

  const { data: files, error } = await query;
  
  if (error) {
    throw error;
  }

  // 提取去重后的选项
  const shops = new Map<string, { id: string; name: string; platform: string; site: string; manager: string }>();
  const platforms = new Set<string>();
  const sites = new Set<string>();
  const exportTypes = new Set<string>();
  const displayNames = new Set<string>();
  const managers = new Set<string>();
  const dateRanges = new Set<string>();

  for (const file of files || []) {
    const shop = file.shops as any;
    if (shop) {
      shops.set(shop.id, {
        id: shop.id,
        name: shop.name,
        platform: shop.platform,
        site: shop.site,
        manager: shop.manager
      });
      if (shop.platform) platforms.add(shop.platform);
      if (shop.site) sites.add(shop.site);
      if (shop.manager) managers.add(shop.manager);
    }
    if (file.export_type) exportTypes.add(file.export_type);
    if (file.display_name) displayNames.add(file.display_name);
    
    // 提取日期区间（按月）
    if (file.created_at) {
      const date = new Date(file.created_at);
      const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      dateRanges.add(month);
    }
  }

  return {
    shops: Array.from(shops.values()).sort((a, b) => a.name.localeCompare(b.name)),
    platforms: Array.from(platforms).sort(),
    sites: Array.from(sites).sort(),
    exportTypes: Array.from(exportTypes).sort(),
    displayNames: Array.from(displayNames).sort(),
    managers: Array.from(managers).sort(),
    dateRanges: Array.from(dateRanges).sort().reverse()
  };
}

/**
 * 获取收集进度统计
 */
export async function getCollectionProgress(
  supabase: SupabaseClient,
  filters: FileFilterParams = {}
) {
  // 获取所有店铺
  const { data: shops } = await supabase
    .from('shops')
    .select('id, name, platform, site, manager')
    .eq('is_active', true);

  if (!shops || shops.length === 0) {
    return [];
  }

  // 获取所有符合条件的文件
  let query = supabase
    .from('uploaded_files')
    .select('shop_id, export_type, created_at');

  query = applyFilters(query, { ...filters, currentVersionOnly: true }, supabase);

  const { data: files } = await query;

  // 按店铺统计上传情况
  const progressMap = new Map<string, {
    shop: { id: string; name: string; platform: string; site: string; manager: string };
    uploadCount: number;
    lastUploadAt: string | null;
  }>();

  for (const shop of shops) {
    progressMap.set(shop.id, {
      shop,
      uploadCount: 0,
      lastUploadAt: null
    });
  }

  for (const file of files || []) {
    const progress = progressMap.get(file.shop_id);
    if (progress) {
      progress.uploadCount++;
      if (!progress.lastUploadAt || file.created_at > progress.lastUploadAt) {
        progress.lastUploadAt = file.created_at;
      }
    }
  }

  return Array.from(progressMap.values())
    .filter(p => {
      // 应用筛选条件
      if (filters.platforms && filters.platforms.length > 0) {
        if (!filters.platforms.includes(p.shop.platform)) return false;
      }
      if (filters.sites && filters.sites.length > 0) {
        if (!filters.sites.includes(p.shop.site)) return false;
      }
      if (filters.managers && filters.managers.length > 0) {
        if (!filters.managers.includes(p.shop.manager)) return false;
      }
      return true;
    })
    .sort((a, b) => a.shop.name.localeCompare(b.shop.name));
}
