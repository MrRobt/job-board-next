export function mockPaymentEnabled(){return process.env.NODE_ENV!=="production"&&process.env.ENABLE_MOCK_PAYMENT==="true";}
