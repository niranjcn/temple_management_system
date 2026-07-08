import { Phone, Mail, MapPin, Heart, Facebook, Instagram, Twitter } from 'lucide-react';
import lotusFooter from '../assets/lotusfooter.png';

const Footer = () => {
  return (
  // UPDATED: Reduced height and increased transparency using gradient opacity and less padding
  <footer className="bg-gradient-to-r from-yellow-700/90 via-amber-800/90 to-amber-900/90 text-white bg-cover">
      {/* REDUCED: py-16 changed to py-10 */}
      <div className="max-w-7xl mx-auto py-10 pr-4 sm:pr-6 lg:pr-8">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-center">
          {/* Temple Info (centered in a 3/12 column to shift it further left) */}
          <div className="flex flex-col items-center text-center space-y-4 md:col-span-3">
            <img src={lotusFooter} alt="lotus" className="h-40 w-40 md:h-48 md:w-48 lg:h-56 lg:w-56 object-contain" />
            <span className="text-xl md:text-2xl font-prata font-bold">Vamanakulangara Vishnu Temple</span>
            <div className="flex space-x-3 mt-2 items-center">
              <a href="#" className="p-2 bg-transparent rounded-lg hover:bg-white/10 transition-colors">
                <Instagram className="h-5 w-5 text-white" />
              </a>
              <a href="#" className="p-2 bg-transparent rounded-lg hover:bg-white/10 transition-colors">
                <Twitter className="h-5 w-5 text-white" />
              </a>
              <a href="#" className="p-2 bg-transparent rounded-lg hover:bg-white/10 transition-colors">
                <Facebook className="h-5 w-5 text-white" />
              </a>
            </div>
            {/* ADJUSTED: text-white/90 to text-white/95 for better visibility over slightly transparent background */}
            <p className="text-white/95 leading-relaxed max-w-xs">
              A sacred sanctuary where devotees find peace, spiritual guidance,
              and divine blessings through traditional rituals and ceremonies.
            </p>
          </div>
          {/* Right-side group (in a wider 9/12 column) */}
          <div className="flex justify-end md:col-span-9">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 w-full lg:w-auto pl-4 sm:pl-0">
              {/* Quick Links */}
              <div className="">
                <h3 className="text-lg font-prata font-semibold mb-6">Quick Links</h3>
                <ul className="space-y-3">
                  {['About Temple', 'Ritual Booking', 'Events', 'Gallery', 'Donations', 'Contact'].map((link) => (
                    <li key={link}>
                      <a
                        href={link === 'Gallery' ? '/gallery' : '#'}
                        // ADJUSTED: text-white/90 to text-white/95
                        className="text-white/95 hover:text-white hover:underline transition-colors"
                      >
                        {link}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Services */}
              <div>
                <h3 className="text-lg font-prata font-semibold mb-6 text-white">Services</h3>
                <ul className="space-y-3">
                  {['Daily Aarti', 'Special Pujas', 'Wedding Ceremonies', 'Festival Celebrations', 'Spiritual Counseling', 'Meditation Classes'].map((service) => (
                    <li key={service}>
                      {/* ADJUSTED: text-white/90 to text-white/95 */}
                      <a href="#" className="text-white/95 hover:text-white hover:underline transition-colors">
                        {service}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Contact Info */}
              <div>
                <h3 className="text-lg font-prata font-semibold mb-6 text-white">Contact Us</h3>
                <div className="space-y-4">
                  <div className="flex items-start space-x-3">
                    <MapPin className="h-5 w-5 mt-0.5 text-white/80" />
                    {/* ADJUSTED: text-white/90 to text-white/95 */}
                    <div className="text-white/95">
                      <div>123 Sacred Street</div>
                      <div>Divine City, DC 12345</div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3">
                    <Phone className="h-5 w-5 text-white/80" />
                    {/* ADJUSTED: text-white/90 to text-white/95 */}
                    <span className="text-white/95">+1 (555) 123-4567</span>
                  </div>
                  <div className="flex items-center space-x-3">
                    <Mail className="h-5 w-5 text-white/80" />
                    {/* ADJUSTED: text-white/90 to text-white/95 */}
                    <span className="text-white/95">info@divinetemple.com</span>
                  </div>
                </div>

                {/* Temple Timings removed — showcased in Hero section for emphasis */}
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
          {/* REDUCED: mt-12 changed to mt-8 */}
          <div className="border-t border-white/20 mt-8 pt-8 text-center">
          {/* ADJUSTED: text-white/90 to text-white/95 */}
          <p className="text-white/95">
            © 2024 Divine Temple. All rights reserved. Made with{' '}
            <Heart className="h-4 w-4 inline text-red-300" /> for spiritual devotion.
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;