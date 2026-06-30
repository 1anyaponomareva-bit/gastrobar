export type PosterSpot = {
  spot_id: string;
  price: string;
  visible?: string;
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
