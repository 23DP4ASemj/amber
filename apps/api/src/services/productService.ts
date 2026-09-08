import type { Store } from '../repositories/store';
import type { Config } from '../config';
import { isVisible } from '../config/compliance';
export class ProductService {
  constructor(private store: Store, private config: Config) {}
  async list(district?: string) {
    return (await this.store.getProducts()).map(row => row.product)
      .filter(product => isVisible(product, this.config, district)).sort((a, b) => a.sort_order - b.sort_order);
  }
}

