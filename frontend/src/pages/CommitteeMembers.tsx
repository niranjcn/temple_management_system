import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { get } from '@/api/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { resolveImageUrl } from '@/lib/utils';
import { ArrowLeft } from 'lucide-react';
// MERGED: Included the lotus image import from the first file
import lotusFooterImage from '@/assets/lotusfooter.png';

interface CommitteeMember {
  _id: string;
  name: string;
  designation: string;
  profile_description: string;
  mobile_prefix?: string;
  phone_number: string;
  image: string;
  preview_order?: number | null;
  view_order?: number | null;
}

const fetchCommitteeMembers = async (): Promise<CommitteeMember[]> => {
  const data = await get<CommitteeMember[]>('/committee/');
  return data;
};

const CommitteeMembers = () => {
  const location = useLocation() as any;
  const fromAdmin: string | undefined = location.state?.fromAdmin;
  const { data: members, isLoading } = useQuery<CommitteeMember[]>({
    queryKey: ['committeeMembers'],
    queryFn: fetchCommitteeMembers,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
  });

  return (
    // MERGED: Using the layout with background image from the first file
    <div className="min-h-screen bg-gradient-sacred py-20 relative overflow-hidden">
      <img
        src={lotusFooterImage}
        alt="Lotus footer background"
        className="absolute bottom-0 left-0 w-full z-0 opacity-30 transform scale-[0.8] pointer-events-none"
      />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="mb-12">
          <Link to={fromAdmin || "/"} state={undefined} className="inline-flex items-center text-primary hover:text-primary/80 mb-4">
            <ArrowLeft className="h-5 w-5 mr-2" />
            {fromAdmin ? 'Back to Admin' : 'Back to Home'}
          </Link>
          <h1 className="text-4xl md:text-5xl font-playfair font-bold text-center text-foreground">
            Our <span className="text-primary">Committee</span>
          </h1>
          <p className="text-xl text-center text-muted-foreground max-w-3xl mx-auto mt-4">Meet the team serving our community.</p>
        </div>

        {isLoading ? (
          // MERGED: Using the centered loading text from the second file
          <div className="text-center">Loading committee members...</div>
        ) : (
          (() => {
            const sorted = (members ?? []).slice().sort((a, b) => {
              const ao = a.view_order ?? Number.POSITIVE_INFINITY;
              const bo = b.view_order ?? Number.POSITIVE_INFINITY;
              if (ao !== bo) return ao - bo;
              return a.name.localeCompare(b.name);
            });
            const featured = sorted.length > 0 ? sorted[0] : null;
            const rest = sorted.slice(1);

            return (
              <div className="space-y-10">
                {featured && (
                  <div className="flex justify-center">
                    <Card className="overflow-hidden card-divine max-w-md w-full">
                      {featured.image && (
                        <div className="flex justify-center mt-6">
                          <img
                            src={resolveImageUrl(featured.image)}
                            alt={featured.name}
                            className="w-28 h-28 object-cover rounded-full border-4 border-primary/20"
                          />
                        </div>
                      )}
                      <CardHeader className="pb-2 text-center">
                        <CardTitle className="text-2xl">{featured.name}</CardTitle>
                        <p className="text-sm text-muted-foreground font-medium">{featured.designation}</p>
                      </CardHeader>
                      <CardContent className="text-center">
                        <p className="text-sm mb-4">{featured.profile_description}</p>
                        <p className="text-sm text-muted-foreground">
                          <strong>Phone:</strong> {(featured.mobile_prefix ?? '+91') + ' ' + featured.phone_number}
                        </p>
                      </CardContent>
                    </Card>
                  </div>
                )}
                {/* MERGED: Using the superior responsive CSS grid from the second file */}
                {rest.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 justify-items-center mt-10">
                    {rest.map((member) => (
                      <Card key={member._id} className="overflow-hidden card-divine w-full max-w-xs">
                        {member.image && (
                          <div className="flex justify-center mt-6">
                            <img
                              src={resolveImageUrl(member.image)}
                              alt={member.name}
                              className="w-24 h-24 object-cover rounded-full border-4 border-primary/20"
                            />
                          </div>
                        )}
                        <CardHeader className="pb-2 text-center">
                          <CardTitle className="text-xl">{member.name}</CardTitle>
                          <p className="text-sm text-muted-foreground font-medium">{member.designation}</p>
                        </CardHeader>
                        <CardContent className="text-center">
                          <p className="text-sm mb-4">{member.profile_description}</p>
                          <p className="text-sm text-muted-foreground">
                            <strong>Phone:</strong> {(member.mobile_prefix ?? '+91') + ' ' + member.phone_number}
                          </p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            );
          })()
        )}
      </div>
    </div>
  );
};

export default CommitteeMembers;
