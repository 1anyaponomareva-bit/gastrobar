export type PosterSpot = {
  spot_id: string;
  price: string;
  visible?: string;
};

export type PosterDishModification = {
  dish_modification_id?: number | string;
  name?: string;
  price?: number | string;
  brutto?: number | string;
  type?: number | string;
  ingredient_id?: number | string;
  sort_order?: number;
  is_deleted?: number | string;
};

export type PosterGroupModification = {
  dish_modification_group_id?: number | string;
  name?: string;
  num_min?: number;
  num_max?: number;
  is_deleted?: number | string;
  modifications?: PosterDishModification[];
};

export type PosterProductModification = {
  modificator_id?: string;
  modificator_name?: string;
  spots?: PosterSpot[];
};

export type PosterProduct = {
  product_id: string;
  product_name: string;
  category_name?: string;
  menu_category_id?: string;
  hidden?: string;
  type?: string;
  unit?: string;
  photo?: string;
  photo_origin?: string | null;
  description?: string;
  spots?: PosterSpot[];
  price?: Record<string, string> | string;
  cost?: string;
  modifications?: PosterProductModification[];
  group_modifications?: PosterGroupModification[];
};

export type PosterCategory = {
  category_id: string;
  category_name: string;
  category_hidden?: string;
  parent_category?: string;
  category_tag?: string | null;
};

export type PosterApiSuccess<T> = {
  response: T;
};

export type PosterApiError = {
  error: {
    code: number;
    message: string;
  };
};
