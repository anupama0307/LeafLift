
import React from 'react';

interface ServiceItem {
  id: string;
  label: string;
  icon?: string;
  isCustom?: boolean;
  promo?: string;
  imageUrl?: string;
}

const PROVIDED_SERVICES: ServiceItem[] = [
  {
    id: 'ride',
    label: 'Ride',
    imageUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCkmiqNr1ymgpGUQfR_BIAKAYAByrL_P4q_ld-vQ5_UKCxzHPVj2S-nO5CmBh3quS1U1VwB_tDgVy5LCmwq1LejOGy2EKsVhVm1rD-HKnnRaLewrSGgV-hqr86JTOMkgm3JO8Woqz_k0Tt9zE1E8rPQqQQVnnj1Nl_R1EEi6YNgHsg78TqVoyvYNhOdPHyD2DpnroqEY3CzzZl6RsuUPA3Yv_HBvxUijF4vy-ywoEyubQmVaHuCZGnQmwHAK6Ki8D5S-2Vh3PR1Its',
    promo: '15%'
  },
  {
    id: 'moto',
    label: 'Moto',
    imageUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDosAne7lRqdzpIdiAhGs-Lsi7wDP4h6R-2H5e6zn17KtGC0E_Xucb4o5P5xX-ygLYeBcyTLU26R_wZ_bcp-J54AeVUfdC5o6dFh8sSosvFNl_eQ8qcUOiImV77QBrPLQ5k5PMjFe6HWCCPVZPl8vgXQ1CWBzjGqRC_CC3H4jT57_Gcorgikkj3wGcwAFLL2so8onGKKG21EbjJWUcvKukxF1qYhbidJINb_ecn9K8HRFUP-xp4MpUBsHm8IMUlVDBCP9_n8dQRo6s'
  },
  {
    id: 'reserve',
    label: 'Reserve',
    icon: 'event',
    isCustom: true,
    promo: 'New'
  }
];

const ServicesScreen: React.FC = () => {
  const ServiceCard: React.FC<{ item: ServiceItem }> = ({ item }) => (
    <div className="flex flex-col items-center gap-1.5 cursor-pointer hover:scale-105 transition-transform group">
      <div className="relative bg-[#f3f3f3] dark:bg-zinc-800 w-full aspect-square rounded-2xl flex items-center justify-center overflow-hidden">
        {item.isCustom ? (
          <span className="material-icons-outlined text-4xl text-gray-700 dark:text-zinc-400 group-hover:text-black dark:group-hover:text-white transition-colors">{item.icon}</span>
        ) : (
          <img alt={item.label} className="w-14 h-14 object-contain opacity-90" src={item.imageUrl} />
        )}
        {item.promo && (
          <div className="absolute top-2 left-2 bg-leaf-500 dark:bg-leaf-600 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-tighter">
            {item.promo}
          </div>
        )}
      </div>
      <span className="text-sm font-bold tracking-tight">{item.label}</span>
    </div>
  );

  return (
    <div className="px-5 pb-24 pt-4 animate-in fade-in duration-500 bg-white dark:bg-[#121212]">
      <h1 className="text-4xl font-bold tracking-tight mt-6 mb-8">Services</h1>

      <section className="mb-10">
        <h2 className="text-lg font-bold mb-4">Go anywhere</h2>
        <div className="grid grid-cols-4 gap-4">
          {PROVIDED_SERVICES.map(service => (
            <ServiceCard key={service.id} item={service} />
          ))}
        </div>
      </section>

      <div className="mt-12 bg-gradient-to-br from-black to-zinc-800 dark:from-leaf-500 dark:to-leaf-600 text-white p-6 rounded-3xl relative overflow-hidden shadow-xl shadow-leaf-500/10">
        <div className="relative z-10">
          <h3 className="text-xl font-black mb-2">Save with UPI</h3>
          <p className="text-sm text-zinc-400 dark:text-leaf-100 max-w-[180px]">Get ₹50 off on your next 3 Moto rides.</p>
        </div>
        <div className="absolute right-0 bottom-0 top-0 w-1/3 flex items-center justify-center">
          <span className="material-icons-outlined text-8xl opacity-20 -rotate-12">motorcycle</span>
        </div>
      </div>
    </div>
  );
};

export default ServicesScreen;
