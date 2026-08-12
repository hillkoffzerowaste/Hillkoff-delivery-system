import { apiV1Options, withApiV1 } from '../../../../../lib/apiV1';
import { POST as deleteCustomer } from '../../../customers/delete/route';

export const runtime = 'nodejs';
export const POST = withApiV1(deleteCustomer, { scopes: ['customers:write'] });
export { apiV1Options as OPTIONS };
